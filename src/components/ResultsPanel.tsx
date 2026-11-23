import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { MISSION_TEMPLATES } from '../data/templates';
import { formatDisplayUrl } from '../lib/urlUtils';
import type { MissionRun, MissionTemplate } from '../types/agent';

interface ResultsPanelProps {
  activeRun: MissionRun | null;
  onSelectTemplate: (template: MissionTemplate, runImmediately: boolean) => void;
  onInspectUrl: (url: string) => void;
  onRetryRun: () => void;
}

export function ResultsPanel({
  activeRun,
  onSelectTemplate,
  onInspectUrl,
  onRetryRun,
}: ResultsPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const isRunning = activeRun?.status === 'running';
  const createdAt = activeRun?.createdAt;

  useEffect(() => {
    if (!isRunning || !createdAt) {
      setElapsedSec(0);
      return;
    }
    const startMs = new Date(createdAt).getTime();
    const update = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, createdAt]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  };

  // Empty / Initial Welcome State
  if (!activeRun) {
    return (
      <section
        aria-label="Mission templates"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="max-w-2xl">
          <h1
            className="text-2xl font-bold tracking-tight text-slate-900"
            style={{ textWrap: 'balance' }}
          >
            Ask in plain language. Verify from live pages.
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Wayfinder navigates websites step by step—following links, reading sections, and
            parsing HTML tables—to return exact answers grounded in the pages it visited.
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Starter Missions</h2>
            <span className="text-xs text-slate-500">Click any mission to run immediately</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MISSION_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="flex flex-col justify-between p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="text-xs text-slate-500 font-medium">{tpl.scopeLabel}</div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                    {tpl.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {tpl.request}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectTemplate(tpl, false)}
                    aria-label={`Load in editor: ${tpl.title}`}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap"
                  >
                    Load in editor
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectTemplate(tpl, true)}
                    aria-label={`Run mission: ${tpl.title}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 transition-colors whitespace-nowrap"
                  >
                    Run mission
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const visitedCount = Object.keys(activeRun.visitedPages).length;

  // Error State (without an extracted answer)
  if (activeRun.status === 'error' && !activeRun.answer) {
    return (
      <section
        aria-label="Extraction error"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">
              Navigation could not complete
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed break-words">
              {activeRun.errorMessage ||
                'An unexpected error occurred while retrieving information from the target site.'}
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={onRetryRun}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Retry Mission
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Running / Streaming State before final answer arrives
  if (activeRun.status === 'running' && !activeRun.answer) {
    const latestStep = activeRun.steps[activeRun.steps.length - 1];
    return (
      <section
        aria-label="Extraction progress"
        aria-live="polite"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <Loader2
              className="w-4 h-4 text-blue-700 animate-spin shrink-0"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-slate-900 truncate">
              Navigating target pages...
            </h2>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
            {activeRun.steps.length} step{activeRun.steps.length === 1 ? '' : 's'} ·{' '}
            {visitedCount} page{visitedCount === 1 ? '' : 's'} · {elapsedSec}s
          </div>
        </div>

        {latestStep && (
          <div className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{latestStep.label}:</span>{' '}
            <span className="font-mono text-xs text-slate-600 break-all">
              {formatDisplayUrl(latestStep.target)}
            </span>
          </div>
        )}

        <div className="space-y-3" aria-hidden="true">
          <div className="h-4 bg-slate-100 rounded w-5/6" />
          <div className="h-4 bg-slate-100 rounded w-full" />
          <div className="h-4 bg-slate-100 rounded w-2/3" />
        </div>

        <div className="pt-2 space-y-2" aria-hidden="true">
          <div className="h-9 bg-slate-50 border border-slate-100 rounded-md" />
          <div className="h-9 bg-slate-50 border border-slate-100 rounded-md" />
          <div className="h-9 bg-slate-50 border border-slate-100 rounded-md" />
        </div>
      </section>
    );
  }

  // Stopped before answer
  if (activeRun.status === 'stopped' && !activeRun.answer) {
    return (
      <section
        aria-label="Stopped mission"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <h2 className="text-base font-semibold text-slate-900">Mission stopped early</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Navigation was cancelled after {activeRun.steps.length} step(s). You can still
          inspect visited pages in the right panel or re-run the mission.
        </p>
        <button
          type="button"
          onClick={onRetryRun}
          className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Run Again
        </button>
      </section>
    );
  }

  const answer = activeRun.answer;
  if (!answer) {
    return null;
  }

  return (
    <section
      aria-label="Retrieved answer"
      className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
    >
      {/* Direct Synthesized Summary */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-emerald-700">Verified Retrieval</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {visitedCount} page{visitedCount === 1 ? '' : 's'} visited
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeRun.steps.length} step{activeRun.steps.length === 1 ? '' : 's'}
              </span>
              {typeof activeRun.totalDurationMs === 'number' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {(activeRun.totalDurationMs / 1000).toFixed(1)}s
                  </span>
                </>
              )}
            </div>
            <h2 className="mt-1.5 text-lg font-bold tracking-tight text-slate-900">
              Retrieved Answer
            </h2>
          </div>

          <button
            type="button"
            onClick={() => handleCopy('summary', answer.summary)}
            aria-label="Copy summary to clipboard"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-md hover:text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedId === 'summary' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                Copy
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-800 leading-relaxed whitespace-pre-line max-w-prose">
          {answer.summary}
        </p>

        {answer.notes && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            <span className="font-semibold">Note:</span> {answer.notes}
          </p>
        )}
      </div>

      {/* Extracted Key Facts Grid */}
      {answer.keyFacts.length > 0 && (
        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Extracted Facts</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {answer.keyFacts.length} item{answer.keyFacts.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3.5 font-semibold w-1/3">Field</th>
                  <th className="py-2.5 px-3.5 font-semibold">Verified Value</th>
                  <th className="py-2.5 px-3.5 font-semibold text-right w-24">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {answer.keyFacts.map((fact, idx) => {
                  const hasSnapshot =
                    fact.sourceUrl && Boolean(activeRun.visitedPages[fact.sourceUrl]);
                  return (
                    <tr
                      key={`${fact.label}-${idx}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2.5 px-3.5 font-medium text-slate-700 align-top">
                        {fact.label}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono tabular-nums text-slate-900 align-top">
                        {fact.value}
                      </td>
                      <td className="py-2.5 px-3.5 text-right align-top whitespace-nowrap">
                        {fact.sourceUrl ? (
                          hasSnapshot ? (
                            <button
                              type="button"
                              onClick={() => onInspectUrl(fact.sourceUrl!)}
                              className="text-blue-700 hover:text-blue-800 font-medium hover:underline"
                            >
                              Inspect
                            </button>
                          ) : (
                            <a
                              href={fact.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 hover:text-blue-800 font-medium hover:underline"
                            >
                              Open
                            </a>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Structured Comparison Table (if present) */}
      {answer.table && answer.table.columns.length > 0 && answer.table.rows.length > 0 && (
        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {answer.table.title || 'Structured Comparison'}
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {answer.table.rows.length} row{answer.table.rows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  {answer.table.columns.map((col, colIdx) => (
                    <th key={`${col}-${colIdx}`} className="py-2.5 px-3.5 font-semibold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {answer.table.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/70 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className={`py-2.5 px-3.5 align-top ${
                          cellIdx === 0
                            ? 'font-semibold text-slate-900 whitespace-nowrap'
                            : 'font-mono tabular-nums text-slate-700'
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Verified Sources & Evidence */}
      {answer.sources.length > 0 && (
        <div className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Verified Sources &amp; Evidence
          </h3>
          <ol className="space-y-3">
            {answer.sources.map((src, index) => {
              const hasSnapshot = Boolean(activeRun.visitedPages[src.url]);
              return (
                <li
                  key={`${src.url}-${index}`}
                  className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                        <span className="font-mono tabular-nums text-slate-400">
                          {String(index + 1).padStart(2, '0')}.
                        </span>
                        <span className="truncate">{src.title}</span>
                      </div>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block text-xs font-mono text-blue-700 hover:underline truncate"
                      >
                        {formatDisplayUrl(src.url)}
                      </a>
                    </div>

                    {hasSnapshot && (
                      <button
                        type="button"
                        onClick={() => onInspectUrl(src.url)}
                        aria-label={`Inspect captured page "${src.title}"`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:border-slate-300 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        Inspect page
                      </button>
                    )}
                  </div>

                  {src.excerpt && (
                    <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                      &ldquo;{src.excerpt}&rdquo;
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
