import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  ExternalLink,
  FileSearch,
  Globe,
  Loader2,
  Search,
  Table2,
  XCircle,
} from 'lucide-react';
import { formatDisplayUrl } from '../lib/urlUtils';
import type { MissionRun, TraceStep, VisitedPageSnapshot } from '../types/agent';

interface InspectorPanelProps {
  activeRun: MissionRun | null;
  activeTab: 'trace' | 'inspector';
  selectedPageUrl: string | null;
  onTabChange: (tab: 'trace' | 'inspector') => void;
  onSelectPageUrl: (url: string) => void;
  onPivotToUrl: (url: string, linkLabel: string) => void;
}

function StepIcon({ step }: { step: TraceStep }) {
  if (step.status === 'running') {
    return <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" aria-hidden="true" />;
  }
  if (step.status === 'error') {
    return <XCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />;
  }
  switch (step.action) {
    case 'extract_tables':
      return <Table2 className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />;
    case 'search_page':
    case 'find_website':
      return <FileSearch className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />;
    case 'deliver_answer':
      return <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />;
    default:
      return <Globe className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />;
  }
}

export function InspectorPanel({
  activeRun,
  activeTab,
  selectedPageUrl,
  onTabChange,
  onSelectPageUrl,
  onPivotToUrl,
}: InspectorPanelProps) {
  const [linkFilter, setLinkFilter] = useState('');

  const visitedList = useMemo<VisitedPageSnapshot[]>(() => {
    if (!activeRun) {
      return [];
    }
    const dedup = new Map<string, VisitedPageSnapshot>();
    Object.values(activeRun.visitedPages).forEach((page) => {
      dedup.set(page.finalUrl, page);
    });
    return Array.from(dedup.values());
  }, [activeRun]);

  const inspectedPage = useMemo<VisitedPageSnapshot | null>(() => {
    if (!activeRun || visitedList.length === 0) {
      return null;
    }
    if (selectedPageUrl && activeRun.visitedPages[selectedPageUrl]) {
      return activeRun.visitedPages[selectedPageUrl];
    }
    return visitedList[visitedList.length - 1];
  }, [activeRun, selectedPageUrl, visitedList]);

  const filteredLinks = useMemo(() => {
    if (!inspectedPage) {
      return [];
    }
    const needle = linkFilter.trim().toLowerCase();
    if (!needle) {
      return inspectedPage.links.slice(0, 30);
    }
    return inspectedPage.links
      .filter(
        (l) =>
          l.text.toLowerCase().includes(needle) || l.href.toLowerCase().includes(needle)
      )
      .slice(0, 30);
  }, [inspectedPage, linkFilter]);

  return (
    <section
      aria-label="Navigation trace and page inspector"
      className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden"
    >
      {/* Tab Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Inspector view"
          className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/80"
        >
          <button
            type="button"
            role="tab"
            id="tab-trace"
            aria-selected={activeTab === 'trace'}
            aria-controls="panel-trace"
            onClick={() => onTabChange('trace')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'trace'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Navigation Trace
          </button>
          <button
            type="button"
            role="tab"
            id="tab-inspector"
            aria-selected={activeTab === 'inspector'}
            aria-controls="panel-inspector"
            onClick={() => onTabChange('inspector')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'inspector'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Page Inspector
          </button>
        </div>

        <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
          {activeTab === 'trace'
            ? `${activeRun?.steps.length ?? 0} steps`
            : `${visitedList.length} pages`}
        </span>
      </div>

      {/* Navigation Trace Tab */}
      {activeTab === 'trace' && (
        <div
          id="panel-trace"
          role="tabpanel"
          aria-labelledby="tab-trace"
          className="p-4 flex-1 max-h-[680px] overflow-y-auto"
        >
          {!activeRun || activeRun.steps.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <Compass
                className="w-7 h-7 text-slate-300 mx-auto mb-2.5"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-slate-800">No navigation steps yet</p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                As Wayfinder opens pages, follows links, searches text, and parses HTML tables,
                every action will stream here in real time.
              </p>
            </div>
          ) : (
            <ol className="space-y-2.5">
              {activeRun.steps.map((step) => {
                const canInspect = Boolean(step.pageUrl && activeRun.visitedPages[step.pageUrl]);
                return (
                  <li
                    key={step.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/40"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">
                        <StepIcon step={step} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900">
                            <span className="font-mono tabular-nums text-slate-400 mr-1.5">
                              {String(step.stepNumber).padStart(2, '0')}
                            </span>
                            {step.label}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                            {step.httpStatus && (
                              <span
                                className={
                                  step.httpStatus < 400
                                    ? 'text-emerald-700'
                                    : 'text-red-700'
                                }
                              >
                                {step.httpStatus}
                              </span>
                            )}
                            {typeof step.durationMs === 'number' && step.durationMs > 0 && (
                              <>
                                {step.httpStatus && <span aria-hidden="true">·</span>}
                                <span>{step.durationMs}ms</span>
                              </>
                            )}
                          </div>
                        </div>

                        <p className="mt-1 text-xs font-mono text-slate-600 truncate">
                          {formatDisplayUrl(step.target)}
                        </p>

                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                          {step.summary}
                        </p>

                        {canInspect && step.pageUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectPageUrl(step.pageUrl!);
                              onTabChange('inspector');
                            }}
                            className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                          >
                            Inspect page DOM
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {/* Page Inspector Tab */}
      {activeTab === 'inspector' && (
        <div
          id="panel-inspector"
          role="tabpanel"
          aria-labelledby="tab-inspector"
          className="p-4 flex-1 max-h-[680px] overflow-y-auto space-y-4"
        >
          {!inspectedPage ? (
            <div className="py-10 px-4 text-center">
              <Globe className="w-7 h-7 text-slate-300 mx-auto mb-2.5" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-800">No page snapshot captured</p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Run a mission to inspect the parsed headings, extracted tables, and outbound
                links of every webpage the agent visits.
              </p>
            </div>
          ) : (
            <>
              {visitedList.length > 1 && (
                <div>
                  <label
                    htmlFor="visited-page-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Visited Page
                  </label>
                  <select
                    id="visited-page-select"
                    value={inspectedPage.finalUrl}
                    onChange={(e) => onSelectPageUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    {visitedList.map((page, idx) => (
                      <option key={page.finalUrl} value={page.finalUrl}>
                        {idx + 1}. {page.title} ({formatDisplayUrl(page.finalUrl)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Address & Metadata Strip */}
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                    {inspectedPage.title}
                  </h3>
                  <a
                    href={inspectedPage.finalUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${inspectedPage.title} in new tab`}
                    className="p-1 text-slate-500 hover:text-blue-700 shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </div>
                <p className="mt-1 text-xs font-mono text-slate-600 break-all">
                  {formatDisplayUrl(inspectedPage.finalUrl)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                  <span
                    className={
                      inspectedPage.statusCode < 400
                        ? 'text-emerald-700 font-medium'
                        : 'text-red-700 font-medium'
                    }
                  >
                    HTTP {inspectedPage.statusCode}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{inspectedPage.durationMs}ms</span>
                  <span aria-hidden="true">·</span>
                  <span>{inspectedPage.wordCount.toLocaleString()} words</span>
                  <span aria-hidden="true">·</span>
                  <span>{inspectedPage.links.length} links</span>
                </div>
              </div>

              {/* Headings Outline */}
              {inspectedPage.headings.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">
                    Document Outline
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {inspectedPage.headings.slice(0, 12).map((h, i) => (
                      <li
                        key={`${h.text}-${i}`}
                        style={{ paddingLeft: `${Math.max(0, h.level - 1) * 12}px` }}
                        className="truncate"
                      >
                        <span className="font-mono text-[10px] text-slate-400 mr-1.5">
                          H{h.level}
                        </span>
                        {h.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Parsed Tables */}
              {inspectedPage.tables.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">
                    Parsed Tables ({inspectedPage.tables.length})
                  </h4>
                  <div className="space-y-3">
                    {inspectedPage.tables.slice(0, 3).map((tbl, tIdx) => (
                      <div
                        key={`${tbl.caption}-${tIdx}`}
                        className="overflow-x-auto border border-slate-200 rounded-lg"
                      >
                        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-700">
                          {tbl.caption}
                        </div>
                        <table className="w-full text-left border-collapse text-[11px]">
                          {tbl.headers.length > 0 && (
                            <thead>
                              <tr className="border-b border-slate-200 bg-white text-slate-600">
                                {tbl.headers.map((h, hIdx) => (
                                  <th key={hIdx} className="py-1.5 px-2.5 font-semibold whitespace-nowrap">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                          )}
                          <tbody className="divide-y divide-slate-100">
                            {tbl.rows.slice(0, 8).map((r, rIdx) => (
                              <tr key={rIdx}>
                                {r.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="py-1.5 px-2.5 font-mono tabular-nums text-slate-700"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discovered Links */}
              {inspectedPage.links.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-semibold text-slate-700">
                      Discovered Links ({inspectedPage.links.length})
                    </h4>
                  </div>

                  <div className="relative mb-2">
                    <Search
                      className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={linkFilter}
                      onChange={(e) => setLinkFilter(e.target.value)}
                      placeholder="Filter links on this page..."
                      aria-label="Filter discovered links"
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {filteredLinks.map((link, lIdx) => (
                      <li
                        key={`${link.href}-${lIdx}`}
                        className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {link.text}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 truncate">
                            {formatDisplayUrl(link.href)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPivotToUrl(link.href, link.text)}
                          className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap shrink-0"
                        >
                          Use as start
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
