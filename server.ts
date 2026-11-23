import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { validateMissionInput } from './src/lib/exportUtils';
import { registerSandboxRoutes } from './src/server/sandboxSite';
import { runNavigationAgent } from './src/server/webNavigator';
import type { AgentStreamEvent, OutputMode } from './src/types/agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Built-in multi-page sandbox website for deterministic multi-hop navigation testing
  registerSandboxRoutes(app);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'wayfinder' });
  });

  app.post('/api/agent/run', async (req: Request, res: Response) => {
    const requestText = typeof req.body?.request === 'string' ? req.body.request : '';
    const startUrl = typeof req.body?.startUrl === 'string' ? req.body.startUrl : '';
    const rawMaxSteps = Number(req.body?.maxSteps);
    const maxSteps = Number.isFinite(rawMaxSteps) ? rawMaxSteps : 6;
    const rawMode = req.body?.outputMode;
    const outputMode: OutputMode =
      rawMode === 'concise' || rawMode === 'deep' || rawMode === 'structured'
        ? rawMode
        : 'structured';

    const validation = validateMissionInput(requestText, startUrl);
    if (!validation.valid) {
      res.status(400).json({
        error: validation.requestError || validation.urlError || 'Invalid input.',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': stream-open\n\n');

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const emit = (event: AgentStreamEvent) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    const localOrigin = `http://127.0.0.1:${port}`;

    try {
      await runNavigationAgent({
        request: requestText,
        startUrl,
        maxSteps,
        outputMode,
        localOrigin,
        signal: abortController.signal,
        emit,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected server error during navigation.';
      emit({ type: 'error', message });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Wayfinder server running on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Wayfinder server:', err);
  process.exit(1);
});
