import { ExternalLink, Plus, Search, Trash2, X } from 'lucide-react';
import { formatDisplayUrl } from '../lib/urlUtils';
import type { MissionRun } from '../types/agent';

interface SidebarProps {
  history: MissionRun[];
  filteredHistory: MissionRun[];
  activeRunId: string | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  onNewMission: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function formatShortTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function statusLabel(status: MissionRun['status']): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Verified';
    case 'stopped':
      return 'Stopped';
    case 'error':
      return 'Error';
  }
}

function statusTextClass(status: MissionRun['status']): string {
  switch (status) {
    case 'running':
      return 'text-amber-700';
    case 'completed':
      return 'text-emerald-700';
    case 'stopped':
      return 'text-slate-500';
    case 'error':
      return 'text-red-700';
  }
}

export function Sidebar({
  history,
  filteredHistory,
  activeRunId,
  searchQuery,
  onSearchChange,
  onSelectRun,
  onDeleteRun,
  onNewMission,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const sidebarBody = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNewMission();
            onCloseMobile();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Wayfinder
        </a>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation sidebar"
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            onNewMission();
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4 shrink-0" />
          New Mission
        </button>
      </div>

      <div className="px-4 pt-4 pb-2">
        <label htmlFor="history-search" className="sr-only">
          Search mission history
        </label>
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="history-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter past missions..."
            className="w-full pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-2 text-xs font-medium text-slate-500">
        <span>Mission History</span>
        <span className="font-mono tabular-nums text-slate-400">{history.length}</span>
      </div>

      <nav
        aria-label="Mission history"
        className="flex-1 overflow-y-auto px-3 pb-4 space-y-1"
      >
        {history.length === 0 ? (
          <div className="px-3 py-6 text-xs text-slate-500 leading-relaxed">
            Completed and active web navigation runs will be saved here for inspection and export.
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="px-3 py-6 text-xs text-slate-500 leading-relaxed">
            No missions match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          filteredHistory.map((run) => {
            const isActive = run.id === activeRunId;
            const visitedCount = Object.keys(run.visitedPages).length;
            return (
              <div
                key={run.id}
                className={`group relative rounded-lg transition-colors ${
                  isActive
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectRun(run.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className="w-full text-left px-3 py-2.5 pr-9 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-700"
                >
                  <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-snug">
                    {run.request}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                    <span className={`font-medium ${statusTextClass(run.status)}`}>
                      {statusLabel(run.status)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {visitedCount > 0
                        ? `${visitedCount}p`
                        : `${run.steps.length}s`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate font-mono">
                      {run.startUrl ? formatDisplayUrl(run.startUrl) : 'Web search'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                    {formatShortTime(run.createdAt)}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRun(run.id);
                  }}
                  aria-label={`Delete mission "${run.request.slice(0, 40)}"`}
                  className="absolute right-2 top-2.5 p-1 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-700 hover:bg-red-50 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50/70">
        <p className="text-xs font-medium text-slate-700">Built-in Test Portal</p>
        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
          Inspect the local 5-page Harbor Cloud docs used for multi-hop navigation tests.
        </p>
        <a
          href="/sandbox/harbor-cloud"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline"
        >
          Open Harbor Cloud Sandbox
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[264px] shrink-0 h-screen sticky top-0">
        {sidebarBody}
      </aside>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation sidebar"
        >
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[280px] max-w-[85vw] h-full shadow-xl">
            {sidebarBody}
          </div>
        </div>
      )}
    </>
  );
}
