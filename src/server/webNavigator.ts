import {
  FunctionDeclaration,
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type Part,
} from '@google/genai';
import {
  extractSectionByHeading,
  parseHtmlDocument,
  searchDocumentPassages,
  type ParsedHtmlDocument,
} from '../lib/htmlParser';
import { checkTargetUrlSafety, formatDisplayUrl } from '../lib/urlUtils';
import type {
  AgentAnswer,
  AgentStreamEvent,
  OutputMode,
  TraceStep,
  VisitedPageSnapshot,
} from '../types/agent';

const AGENT_MODEL = 'gemini-4-hydrogen';

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  try {
    const parsed = JSON.parse(raw);
    const apiErr = parsed?.error ?? parsed;
    if (apiErr && typeof apiErr.message === 'string') {
      const status = apiErr.status || apiErr.code || '';
      if (status === 'PERMISSION_DENIED' || apiErr.code === 403 || apiErr.code === 400) {
        return `${apiErr.message} Please verify your Gemini API key in Settings > Secrets.`;
      }
      if (apiErr.code === 429 || status === 'RESOURCE_EXHAUSTED') {
        return 'Gemini API quota exceeded (429). Upgrading to a paid tier increases quota—you can select a billing-enabled API key in Settings > Secrets, or retry later.';
      }
      if (apiErr.code === 503 || status === 'UNAVAILABLE') {
        return 'The AI model is temporarily experiencing high demand (503). Please retry in a few moments.';
      }
      return apiErr.message;
    }
  } catch {
    // Not JSON
  }
  return raw;
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg.includes('"code":503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  );
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  signal?: AbortSignal
) {
  const delays = [1000, 2500];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (signal?.aborted) {
      throw new Error('Navigation run aborted.');
    }
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastError = err;
      if (attempt < delays.length && isTransientError(err) && !signal?.aborted) {
        await sleepWithAbort(delays[attempt], signal);
        continue;
      }
      throw new Error(formatGeminiError(err));
    }
  }
  throw new Error(formatGeminiError(lastError));
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Please verify your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: 'open_url',
    description:
      'Fetch and inspect a webpage at the given URL. Returns the page title, headings outline, clean text preview, discovered links, and count of HTML tables. Use this to navigate to starting URLs and follow relevant subpage links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'Absolute http/https URL or /sandbox/... path to open.',
        },
        reason: {
          type: Type.STRING,
          description: 'Brief note on why you are opening this URL.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_page',
    description:
      'Search the full text of a webpage for specific keywords or phrases to locate exact figures, policies, or details without missing content below the fold.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'The URL of the page to search.',
        },
        query: {
          type: Type.STRING,
          description: 'Keywords or short phrase to search for on the page.',
        },
      },
      required: ['url', 'query'],
    },
  },
  {
    name: 'extract_tables',
    description:
      'Extract all structured HTML tables (headers, rows, captions) from a webpage. Ideal for pricing plans, rate limits, specifications, schedules, and comparison matrices.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'The URL of the page whose tables should be extracted.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_section',
    description:
      'Read the complete text under a specific heading or section title on a webpage.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: Type.STRING,
          description: 'The URL of the page.',
        },
        heading_query: {
          type: Type.STRING,
          description: 'Heading title or partial heading text to read.',
        },
      },
      required: ['url', 'heading_query'],
    },
  },
  {
    name: 'find_website',
    description:
      'Search the public web using Google Search to discover authoritative URLs and high-level facts when no starting URL was provided or when you need to find a specific official page.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Focused search query to discover relevant web pages.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'deliver_answer',
    description:
      'Call this tool once you have verified all needed information from the visited pages to deliver the final structured answer with citations.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description:
            'Clear, direct, accurate natural-language answer addressing every part of the user request.',
        },
        keyFacts: {
          type: Type.ARRAY,
          description: 'Key extracted facts as concise label-value pairs.',
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: 'Short fact label.' },
              value: { type: Type.STRING, description: 'Exact verified value.' },
              sourceUrl: {
                type: Type.STRING,
                description: 'Exact URL where this fact was observed.',
              },
            },
            required: ['label', 'value'],
          },
        },
        table: {
          type: Type.OBJECT,
          description:
            'Optional structured comparison table when the request asks to compare multiple items, tiers, or specs.',
          properties: {
            title: { type: Type.STRING },
            columns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            rows: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
          required: ['title', 'columns', 'rows'],
        },
        sources: {
          type: Type.ARRAY,
          description: 'Verified source pages and verbatim evidence excerpts supporting the answer.',
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              url: { type: Type.STRING },
              excerpt: {
                type: Type.STRING,
                description: 'Short verbatim quote or table excerpt from the page.',
              },
            },
            required: ['title', 'url', 'excerpt'],
          },
        },
        notes: {
          type: Type.STRING,
          description:
            'Optional caveat if any requested detail was not published on the visited pages.',
        },
      },
      required: ['summary', 'keyFacts', 'sources'],
    },
  },
];

interface CachedPage {
  snapshot: VisitedPageSnapshot;
  parsed: ParsedHtmlDocument;
}

async function fetchAndParsePage(
  rawUrl: string,
  localOrigin: string,
  signal?: AbortSignal
): Promise<CachedPage> {
  const safety = checkTargetUrlSafety(rawUrl, localOrigin);
  if (!safety.allowed || !safety.normalizedUrl) {
    throw new Error(safety.reason || 'URL is not permitted.');
  }

  const startMs = Date.now();
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 14000);

  const onOuterAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const response = await fetch(safety.normalizedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: timeoutController.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; WayfinderAgent/1.0; +https://wayfinder.local)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const durationMs = Date.now() - startMs;
    const finalUrl = response.url || safety.normalizedUrl;

    // Validate redirected destination for SSRF safety too
    const finalSafety = checkTargetUrlSafety(finalUrl, localOrigin);
    if (!finalSafety.allowed) {
      throw new Error('Redirected destination is blocked by URL safety rules.');
    }

    const contentType = response.headers.get('content-type') || '';
    const rawBody = await response.text();
    const boundedBody = rawBody.slice(0, 750_000);

    let parsed: ParsedHtmlDocument;
    if (contentType.includes('html') || boundedBody.trim().startsWith('<')) {
      parsed = parseHtmlDocument(boundedBody, finalUrl);
    } else {
      const cleanText = boundedBody.slice(0, 18000);
      parsed = {
        title: formatDisplayUrl(finalUrl),
        description: contentType || 'Plain text document',
        headings: [],
        sections: [],
        cleanText,
        textPreview: cleanText.slice(0, 2600),
        wordCount: cleanText.split(/\s+/).filter(Boolean).length,
        links: [],
        tables: [],
      };
    }

    const snapshot: VisitedPageSnapshot = {
      url: safety.normalizedUrl,
      finalUrl,
      title: parsed.title,
      description: parsed.description,
      statusCode: response.status,
      fetchedAt: new Date().toISOString(),
      durationMs,
      headings: parsed.headings,
      textPreview: parsed.textPreview,
      wordCount: parsed.wordCount,
      links: parsed.links,
      tables: parsed.tables,
    };

    return { snapshot, parsed };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

export interface RunAgentOptions {
  request: string;
  startUrl: string;
  maxSteps: number;
  outputMode: OutputMode;
  localOrigin: string;
  signal?: AbortSignal;
  emit: (event: AgentStreamEvent) => void;
}

function buildSystemInstruction(outputMode: OutputMode, maxSteps: number): string {
  const styleGuidance =
    outputMode === 'concise'
      ? 'Keep the final summary crisp (2-4 sentences) and include only the most essential verified facts.'
      : outputMode === 'deep'
        ? 'Explore multiple relevant subpages thoroughly, cross-verify details, and provide a rich summary plus a structured comparison table when helpful.'
        : 'Prioritize structured facts (keyFacts array) and structured tables with exact numbers, dates, and URLs.';

  return [
    'You are Wayfinder, a precise AI web navigation and information retrieval agent.',
    'Your job is to understand the user request, navigate real websites using your tools, follow relevant links across pages, inspect tables or sections when needed, and return verified information backed by exact visited URLs.',
    'Navigation rules:',
    '1. If a starting URL is provided, call open_url on it first. Inspect its links and content, then follow the most relevant subpage links (e.g. pricing, limits, documentation, security, releases) until you have verified every part of the user request.',
    '2. If no starting URL is provided, call find_website first to discover authoritative URLs, then call open_url on the best URL(s) to verify details directly.',
    '3. Whenever a page contains structured data like pricing tiers, specs, or quotas (tablesCount > 0), call extract_tables to read exact cell values accurately.',
    '4. Never invent or guess figures, dates, or URLs. If a piece of information is missing from the pages you inspected, state that clearly in notes.',
    `5. You have a budget of at most ${maxSteps} navigation tool steps before calling deliver_answer. Stay focused and call deliver_answer as soon as all requested facts are verified.`,
    styleGuidance,
  ].join('\n');
}

function coerceAnswerPayload(rawArgs: Record<string, unknown>): AgentAnswer {
  const summary =
    typeof rawArgs.summary === 'string' && rawArgs.summary.trim()
      ? rawArgs.summary.trim()
      : 'Completed web navigation and extracted the available details.';

  const keyFacts = Array.isArray(rawArgs.keyFacts)
    ? rawArgs.keyFacts
        .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
        .map((f) => ({
          label: String(f.label ?? 'Detail'),
          value: String(f.value ?? ''),
          sourceUrl: typeof f.sourceUrl === 'string' ? f.sourceUrl : undefined,
        }))
        .filter((f) => f.value.length > 0)
    : [];

  let table: AgentAnswer['table'];
  if (rawArgs.table && typeof rawArgs.table === 'object') {
    const t = rawArgs.table as Record<string, unknown>;
    const columns = Array.isArray(t.columns) ? t.columns.map(String) : [];
    const rows = Array.isArray(t.rows)
      ? t.rows.map((r) => (Array.isArray(r) ? r.map(String) : []))
      : [];
    if (columns.length > 0 && rows.length > 0) {
      table = {
        title: typeof t.title === 'string' ? t.title : 'Extracted Comparison',
        columns,
        rows,
      };
    }
  }

  const sources = Array.isArray(rawArgs.sources)
    ? rawArgs.sources
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s) => ({
          title: String(s.title ?? 'Visited Page'),
          url: String(s.url ?? ''),
          excerpt: String(s.excerpt ?? ''),
        }))
        .filter((s) => s.url.length > 0)
    : [];

  const notes =
    typeof rawArgs.notes === 'string' && rawArgs.notes.trim()
      ? rawArgs.notes.trim()
      : undefined;

  return { summary, keyFacts, table, sources, notes };
}

export async function runNavigationAgent(options: RunAgentOptions): Promise<void> {
  const { request, startUrl, maxSteps, outputMode, localOrigin, signal, emit } = options;
  const runStart = Date.now();
  const ai = createGeminiClient();
  const pageCache = new Map<string, CachedPage>();

  const boundedMaxSteps = Math.max(2, Math.min(12, maxSteps));
  const systemInstruction = buildSystemInstruction(outputMode, boundedMaxSteps);

  let stepCounter = 0;
  let finalAnswer: AgentAnswer | null = null;
  const thinkingLevel =
    outputMode === 'deep' ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;

  const ensureCachedPage = async (urlInput: string): Promise<CachedPage> => {
    const safety = checkTargetUrlSafety(urlInput, localOrigin);
    if (!safety.allowed || !safety.normalizedUrl) {
      throw new Error(safety.reason || 'Blocked or invalid URL.');
    }
    const existing = pageCache.get(safety.normalizedUrl);
    if (existing) {
      return existing;
    }
    const fetched = await fetchAndParsePage(safety.normalizedUrl, localOrigin, signal);
    pageCache.set(fetched.snapshot.url, fetched);
    pageCache.set(fetched.snapshot.finalUrl, fetched);
    emit({ type: 'page_visited', page: fetched.snapshot });
    return fetched;
  };

  // Pre-open user-supplied starting URL immediately so the trace streams within milliseconds
  let initialPageContext = '';
  if (startUrl.trim()) {
    stepCounter += 1;
    const stepId = `step-${stepCounter}`;
    const t0 = Date.now();
    const initialStep: TraceStep = {
      id: stepId,
      stepNumber: stepCounter,
      action: 'open_url',
      label: 'Opened starting page',
      target: startUrl.trim(),
      status: 'running',
      summary: 'Loading starting URL...',
      startedAt: new Date().toISOString(),
    };
    emit({ type: 'step_start', step: initialStep });
    try {
      const cached = await ensureCachedPage(startUrl.trim());
      emit({
        type: 'step_update',
        step: {
          ...initialStep,
          status: 'completed',
          durationMs: Date.now() - t0,
          httpStatus: cached.snapshot.statusCode,
          pageUrl: cached.snapshot.finalUrl,
          summary: `${cached.snapshot.title} · ${cached.snapshot.links.length} links · ${cached.snapshot.tables.length} table(s)`,
        },
      });
      initialPageContext =
        '\nInitial starting page has already been opened and inspected:\n' +
        JSON.stringify({
          url: cached.snapshot.finalUrl,
          statusCode: cached.snapshot.statusCode,
          title: cached.snapshot.title,
          description: cached.snapshot.description,
          headings: cached.snapshot.headings.map((h) => `H${h.level}: ${h.text}`),
          tablesCount: cached.snapshot.tables.length,
          textPreview: cached.snapshot.textPreview,
          links: cached.snapshot.links.slice(0, 45).map((l) => ({
            text: l.text,
            href: l.href,
          })),
        });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load starting URL.';
      emit({
        type: 'step_update',
        step: {
          ...initialStep,
          status: 'error',
          durationMs: Date.now() - t0,
          summary: msg,
        },
      });
      initialPageContext = `\nOpening the starting URL failed with error: ${msg}`;
    }
  }

  const userPromptParts = [
    `User request: ${request.trim()}`,
    startUrl.trim()
      ? `Starting URL: ${startUrl.trim()}`
      : 'Starting URL: None provided (use find_website to discover the best authoritative source URLs first).',
    initialPageContext,
  ].filter(Boolean);

  const contents: Content[] = [
    {
      role: 'user',
      parts: [{ text: userPromptParts.join('\n') }],
    },
  ];

  for (let turn = 0; turn < boundedMaxSteps + 2; turn += 1) {
    if (signal?.aborted) {
      return;
    }

    const isFinalTurn = stepCounter >= boundedMaxSteps;
    const response = await generateWithRetry(
      ai,
      {
        model: AGENT_MODEL,
        contents,
        config: {
          thinkingConfig: { thinkingLevel },
          systemInstruction: isFinalTurn
            ? `${systemInstruction}\nYou have reached the step budget. Call deliver_answer right now using the verified information you already gathered.`
            : systemInstruction,
          tools: [{ functionDeclarations: AGENT_TOOLS }],
        },
      },
      signal
    );

    if (signal?.aborted) {
      return;
    }

    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) {
      contents.push(modelContent);
    }

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      const fallbackText = (response.text || '').trim();
      if (fallbackText) {
        const visitedSources = Array.from(
          new Map(
            Array.from(pageCache.values()).map((c) => [c.snapshot.finalUrl, c.snapshot])
          ).values()
        ).map((snap) => ({
          title: snap.title,
          url: snap.finalUrl,
          excerpt: snap.description || snap.textPreview.slice(0, 180),
        }));

        finalAnswer = {
          summary: fallbackText,
          keyFacts: [],
          sources: visitedSources,
        };
        emit({ type: 'answer', answer: finalAnswer });
      }
      break;
    }

    const responseParts: Part[] = [];

    for (const call of calls) {
      if (signal?.aborted) {
        return;
      }

      const name = call.name || 'open_url';
      const args = (call.args || {}) as Record<string, unknown>;

      if (name === 'deliver_answer') {
        stepCounter += 1;
        const stepId = `step-${stepCounter}`;
        const answerStep: TraceStep = {
          id: stepId,
          stepNumber: stepCounter,
          action: 'deliver_answer',
          label: 'Synthesized verified answer',
          target: `${pageCache.size > 0 ? new Set(Array.from(pageCache.values()).map((p) => p.snapshot.finalUrl)).size : 0} source page(s)`,
          status: 'completed',
          summary: 'Structured facts and citations compiled.',
          durationMs: 0,
          startedAt: new Date().toISOString(),
        };
        emit({ type: 'step_start', step: answerStep });
        finalAnswer = coerceAnswerPayload(args);
        emit({ type: 'answer', answer: finalAnswer });
        responseParts.push({
          functionResponse: {
            id: call.id,
            name,
            response: { ok: true },
          },
        });
        break;
      }

      stepCounter += 1;
      const stepId = `step-${stepCounter}`;
      const stepStart = Date.now();
      const targetUrl = String(args.url ?? args.query ?? '');

      const actionLabelMap: Record<string, string> = {
        open_url: 'Opened webpage',
        search_page: 'Searched page text',
        extract_tables: 'Extracted HTML tables',
        read_section: 'Read page section',
        find_website: 'Searched public web',
      };

      const initialStep: TraceStep = {
        id: stepId,
        stepNumber: stepCounter,
        action: (name in actionLabelMap ? name : 'open_url') as TraceStep['action'],
        label: actionLabelMap[name] || 'Navigated',
        target: targetUrl,
        status: 'running',
        summary:
          typeof args.reason === 'string' && args.reason.trim()
            ? args.reason.trim()
            : `Executing ${name}...`,
        startedAt: new Date().toISOString(),
      };
      emit({ type: 'step_start', step: initialStep });

      try {
        let toolResult: Record<string, unknown>;
        let summaryText = '';
        let httpStatus: number | undefined;
        let pageUrl: string | undefined;

        if (name === 'open_url') {
          const cached = await ensureCachedPage(String(args.url ?? ''));
          httpStatus = cached.snapshot.statusCode;
          pageUrl = cached.snapshot.finalUrl;
          summaryText = `${cached.snapshot.title} · ${cached.snapshot.links.length} links · ${cached.snapshot.tables.length} table(s)`;
          toolResult = {
            url: cached.snapshot.finalUrl,
            statusCode: cached.snapshot.statusCode,
            title: cached.snapshot.title,
            description: cached.snapshot.description,
            headings: cached.snapshot.headings.map((h) => `H${h.level}: ${h.text}`),
            tablesCount: cached.snapshot.tables.length,
            wordCount: cached.snapshot.wordCount,
            textPreview: cached.snapshot.textPreview,
            links: cached.snapshot.links.slice(0, 45).map((l) => ({
              text: l.text,
              href: l.href,
            })),
          };
        } else if (name === 'search_page') {
          const cached = await ensureCachedPage(String(args.url ?? ''));
          const query = String(args.query ?? '');
          const matches = searchDocumentPassages(cached.parsed.cleanText, query, 8);
          httpStatus = cached.snapshot.statusCode;
          pageUrl = cached.snapshot.finalUrl;
          summaryText = `Found ${matches.length} matching passage(s) for "${query}"`;
          toolResult = {
            url: cached.snapshot.finalUrl,
            query,
            matches: matches.map((m) => m.snippet),
          };
        } else if (name === 'extract_tables') {
          const cached = await ensureCachedPage(String(args.url ?? ''));
          httpStatus = cached.snapshot.statusCode;
          pageUrl = cached.snapshot.finalUrl;
          summaryText = `Extracted ${cached.snapshot.tables.length} structured table(s)`;
          toolResult = {
            url: cached.snapshot.finalUrl,
            tables: cached.snapshot.tables,
          };
        } else if (name === 'read_section') {
          const cached = await ensureCachedPage(String(args.url ?? ''));
          const headingQuery = String(args.heading_query ?? '');
          const section = extractSectionByHeading(cached.parsed, headingQuery);
          httpStatus = cached.snapshot.statusCode;
          pageUrl = cached.snapshot.finalUrl;
          summaryText = section
            ? `Read section "${section.heading}"`
            : `No heading matched "${headingQuery}"`;
          toolResult = section
            ? {
                url: cached.snapshot.finalUrl,
                heading: section.heading,
                content: section.content,
              }
            : {
                url: cached.snapshot.finalUrl,
                error: `No section matched "${headingQuery}".`,
                availableHeadings: cached.snapshot.headings.map((h) => h.text),
              };
        } else if (name === 'find_website') {
          const query = String(args.query ?? '');
          const searchResp = await generateWithRetry(
            ai,
            {
              model: AGENT_MODEL,
              contents: `Find the most authoritative official web pages for: ${query}. Return a brief summary of what each site covers.`,
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                tools: [{ googleSearch: {} }],
              },
            },
            signal
          );
          const chunks =
            searchResp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
          const discoveredUrls = chunks
            .map((chunk) => ({
              title: chunk.web?.title || 'Web result',
              url: chunk.web?.uri || '',
            }))
            .filter((item) => Boolean(item.url));

          summaryText = `Discovered ${discoveredUrls.length} candidate URL(s)`;
          toolResult = {
            query,
            overview: searchResp.text || '',
            discoveredUrls: discoveredUrls.slice(0, 8),
          };
        } else {
          toolResult = { error: `Unknown tool: ${name}` };
          summaryText = `Unknown tool ${name}`;
        }

        const completedStep: TraceStep = {
          ...initialStep,
          status: 'completed',
          summary: summaryText,
          durationMs: Date.now() - stepStart,
          httpStatus,
          pageUrl,
        };
        emit({ type: 'step_update', step: completedStep });

        responseParts.push({
          functionResponse: {
            id: call.id,
            name,
            response: toolResult,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to execute navigation step.';
        const failedStep: TraceStep = {
          ...initialStep,
          status: 'error',
          summary: message,
          durationMs: Date.now() - stepStart,
        };
        emit({ type: 'step_update', step: failedStep });
        responseParts.push({
          functionResponse: {
            id: call.id,
            name,
            response: { error: message },
          },
        });
      }
    }

    if (finalAnswer) {
      break;
    }

    if (responseParts.length > 0) {
      contents.push({
        role: 'user',
        parts: responseParts,
      });
    }
  }

  emit({ type: 'done', totalDurationMs: Date.now() - runStart });
}
