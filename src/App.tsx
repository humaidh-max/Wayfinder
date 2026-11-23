import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileJson, Menu } from 'lucide-react';
import { InspectorPanel } from './components/InspectorPanel';
import { MissionComposer } from './components/MissionComposer';
import { ResultsPanel } from './components/ResultsPanel';
import { Sidebar } from './components/Sidebar';
import {
  filterMissionHistory,
  formatMissionAsJson,
  formatMissionAsMarkdown,
  validateMissionInput,
} from './lib/exportUtils';
import type {
  AgentStreamEvent,
  MissionRun,
  MissionTemplate,
  OutputMode,
} from './types/agent';

const STORAGE_KEY = 'wayfinder_mission_history_v1';

function loadSavedHistory(): MissionRun[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.slice(0, 25).map((item: MissionRun) => ({
      ...item,
      status: item.status === 'running' ? 'stopped' : item.status,
    }));
  } catch {
    return [];
  }
}

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [history, setHistory] = useState<MissionRun[]>(() => loadSavedHistory());
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Composer state
  const [request, setRequest] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [maxSteps, setMaxSteps] = useState(6);
  const [outputMode, setOutputMode] = useState<OutputMode>('structured');
  const [requestError, setRequestError] = useState<string | undefined>();
  const [urlError, setUrlError] = useState<string | undefined>();

  // Right inspector panel state
  const [inspectorTab, setInspectorTab] = useState<'trace' | 'inspector'>('trace');
  const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 25)));
    } catch {
      // Ignore quota errors
    }
  }, [history]);

  const activeRun = useMemo(
    () => history.find((item) => item.id === activeRunId) ?? null,
    [history, activeRunId]
  );

  const filteredHistory = useMemo(
    () => filterMissionHistory(history, searchQuery),
    [history, searchQuery]
  );

  const isRunning = activeRun?.status === 'running';

  const updateRunById = (runId: string, updater: (run: MissionRun) => MissionRun) => {
    setHistory((prev) => prev.map((item) => (item.id === runId ? updater(item) : item)));
  };

  const startMission = async (params?: {
    request: string;
    startUrl: string;
    maxSteps: number;
    outputMode: OutputMode;
  }) => {
    const reqText = params ? params.request : request;
    const targetUrl = params ? params.startUrl : startUrl;
    const stepsLimit = params ? params.maxSteps : maxSteps;
    const mode = params ? params.outputMode : outputMode;

    const validation = validateMissionInput(reqText, targetUrl);
    setRequestError(validation.requestError);
    setUrlError(validation.urlError);
    if (!validation.valid) {
      return;
    }

    // Cancel any existing in-flight run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newRun: MissionRun = {
      id: runId,
      request: reqText.trim(),
      startUrl: targetUrl.trim(),
      maxSteps: stepsLimit,
      outputMode: mode,
      status: 'running',
      createdAt: new Date().toISOString(),
      steps: [],
      visitedPages: {},
    };

    setHistory((prev) => [newRun, ...prev.slice(0, 24)]);
    setActiveRunId(runId);
    setInspectorTab('trace');
    setSelectedPageUrl(null);

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          request: reqText.trim(),
          startUrl: targetUrl.trim(),
          maxSteps: stepsLimit,
          outputMode: mode,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg =
          typeof errBody?.error === 'string'
            ? errBody.error
            : `Request failed with HTTP ${response.status}.`;
        updateRunById(runId, (r) => ({
          ...r,
          status: 'error',
          errorMessage: msg,
          completedAt: new Date().toISOString(),
        }));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response is not available in this browser.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (event: AgentStreamEvent) => {
        if (event.type === 'step_start') {
          updateRunById(runId, (r) => ({
            ...r,
            steps: [...r.steps, event.step],
          }));
        } else if (event.type === 'step_update') {
          updateRunById(runId, (r) => ({
            ...r,
            steps: r.steps.map((s) => (s.id === event.step.id ? event.step : s)),
          }));
        } else if (event.type === 'page_visited') {
          updateRunById(runId, (r) => ({
            ...r,
            visitedPages: {
              ...r.visitedPages,
              [event.page.url]: event.page,
              [event.page.finalUrl]: event.page,
            },
          }));
          setSelectedPageUrl((prev) => prev ?? event.page.finalUrl);
        } else if (event.type === 'answer') {
          updateRunById(runId, (r) => ({
            ...r,
            answer: event.answer,
          }));
        } else if (event.type === 'error') {
          updateRunById(runId, (r) => ({
            ...r,
            status: 'error',
            errorMessage: event.message,
            completedAt: new Date().toISOString(),
          }));
        } else if (event.type === 'done') {
          updateRunById(runId, (r) => ({
            ...r,
            status: r.status === 'error' ? 'error' : 'completed',
            totalDurationMs: event.totalDurationMs,
            completedAt: new Date().toISOString(),
          }));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const chunk of parts) {
          const line = chunk
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!line) {
            continue;
          }
          try {
            const parsed = JSON.parse(line.slice(6)) as AgentStreamEvent;
            handleEvent(parsed);
          } catch {
            // Skip malformed SSE frame
          }
        }
      }

      // Ensure running state settles if stream closed cleanly without explicit done frame
      updateRunById(runId, (r) =>
        r.status === 'running'
          ? {
              ...r,
              status: r.answer ? 'completed' : 'error',
              errorMessage: r.answer
                ? undefined
                : 'The navigation stream ended before an answer was returned.',
              completedAt: new Date().toISOString(),
            }
          : r
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateRunById(runId, (r) => ({
          ...r,
          status: 'stopped',
          completedAt: new Date().toISOString(),
        }));
      } else {
        const msg =
          err instanceof Error ? err.message : 'Network error while running navigation agent.';
        updateRunById(runId, (r) => ({
          ...r,
          status: 'error',
          errorMessage: msg,
          completedAt: new Date().toISOString(),
        }));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleStopRun = () => {
    abortControllerRef.current?.abort();
  };

  const handleSelectRun = (runId: string) => {
    const found = history.find((item) => item.id === runId);
    setActiveRunId(runId);
    setRequestError(undefined);
    setUrlError(undefined);
    if (found) {
      setRequest(found.request);
      setStartUrl(found.startUrl);
      setMaxSteps(found.maxSteps);
      setOutputMode(found.outputMode);
      const firstPage = Object.values(found.visitedPages)[0]?.finalUrl ?? null;
      setSelectedPageUrl(firstPage);
    }
  };

  const handleDeleteRun = (runId: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== runId));
    if (activeRunId === runId) {
      setActiveRunId(null);
      setSelectedPageUrl(null);
    }
  };

  const handleNewMission = () => {
    if (isRunning) {
      abortControllerRef.current?.abort();
    }
    setActiveRunId(null);
    setRequest('');
    setStartUrl('');
    setRequestError(undefined);
    setUrlError(undefined);
    setSelectedPageUrl(null);
    setInspectorTab('trace');
  };

  const handleSelectTemplate = (template: MissionTemplate, runImmediately: boolean) => {
    setRequest(template.request);
    setStartUrl(template.startUrl);
    setMaxSteps(template.maxSteps);
    setOutputMode(template.outputMode);
    setRequestError(undefined);
    setUrlError(undefined);

    if (runImmediately) {
      void startMission({
        request: template.request,
        startUrl: template.startUrl,
        maxSteps: template.maxSteps,
        outputMode: template.outputMode,
      });
    }
  };

  const handleInspectUrl = (url: string) => {
    setSelectedPageUrl(url);
    setInspectorTab('inspector');
  };

  const handlePivotToUrl = (url: string, linkLabel: string) => {
    if (isRunning) {
      return;
    }
    setActiveRunId(null);
    setStartUrl(url);
    setRequest(`Extract the key details and structured information from "${linkLabel}".`);
    setRequestError(undefined);
    setUrlError(undefined);
  };

  const handleExportMarkdown = () => {
    if (!activeRun) {
      return;
    }
    const md = formatMissionAsMarkdown(activeRun);
    triggerFileDownload(`wayfinder-${activeRun.id}.md`, md, 'text/markdown;charset=utf-8');
  };

  const handleExportJson = () => {
    if (!activeRun) {
      return;
    }
    const json = formatMissionAsJson(activeRun);
    triggerFileDownload(`wayfinder-${activeRun.id}.json`, json, 'application/json;charset=utf-8');
  };

  const breadcrumbTitle = activeRun
    ? activeRun.request.length > 52
      ? `${activeRun.request.slice(0, 52)}...`
      : activeRun.request
    : 'New Mission';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        history={history}
        filteredHistory={filteredHistory}
        activeRunId={activeRunId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectRun={handleSelectRun}
        onDeleteRun={handleDeleteRun}
        onNewMission={handleNewMission}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, contextual export actions on right */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="lg:hidden p-1.5 -ml-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 whitespace-nowrap shrink-0">Missions</span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {breadcrumbTitle}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!activeRun || !activeRun.answer}
              onClick={handleExportMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export Markdown
            </button>
            <button
              type="button"
              disabled={!activeRun}
              onClick={handleExportJson}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
            >
              <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
              JSON
            </button>
          </div>
        </header>

        {/* Main Workspace Canvas */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          <MissionComposer
            request={request}
            startUrl={startUrl}
            maxSteps={maxSteps}
            outputMode={outputMode}
            isRunning={isRunning}
            requestError={requestError}
            urlError={urlError}
            onRequestChange={(val) => {
              setRequest(val);
              if (requestError) setRequestError(undefined);
            }}
            onStartUrlChange={(val) => {
              setStartUrl(val);
              if (urlError) setUrlError(undefined);
            }}
            onMaxStepsChange={setMaxSteps}
            onOutputModeChange={setOutputMode}
            onSubmit={() => void startMission()}
            onStop={handleStopRun}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 min-w-0">
              <ResultsPanel
                activeRun={activeRun}
                onSelectTemplate={handleSelectTemplate}
                onInspectUrl={handleInspectUrl}
                onRetryRun={() => void startMission()}
              />
            </div>

            <div className="lg:col-span-5 min-w-0">
              <InspectorPanel
                activeRun={activeRun}
                activeTab={inspectorTab}
                selectedPageUrl={selectedPageUrl}
                onTabChange={setInspectorTab}
                onSelectPageUrl={setSelectedPageUrl}
                onPivotToUrl={handlePivotToUrl}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
