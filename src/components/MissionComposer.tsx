import type { FormEvent, KeyboardEvent } from 'react';
import { AlertCircle, ArrowRight, Globe, Square } from 'lucide-react';
import type { OutputMode } from '../types/agent';

interface MissionComposerProps {
  request: string;
  startUrl: string;
  maxSteps: number;
  outputMode: OutputMode;
  isRunning: boolean;
  requestError?: string;
  urlError?: string;
  onRequestChange: (value: string) => void;
  onStartUrlChange: (value: string) => void;
  onMaxStepsChange: (value: number) => void;
  onOutputModeChange: (value: OutputMode) => void;
  onSubmit: () => void;
  onStop: () => void;
}

const OUTPUT_MODES: { value: OutputMode; label: string }[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'structured', label: 'Structured' },
  { value: 'deep', label: 'Deep' },
];

export function MissionComposer({
  request,
  startUrl,
  maxSteps,
  outputMode,
  isRunning,
  requestError,
  urlError,
  onRequestChange,
  onStartUrlChange,
  onMaxStepsChange,
  onOutputModeChange,
  onSubmit,
  onStop,
}: MissionComposerProps) {
  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isRunning) {
      onSubmit();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isRunning) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <section
      aria-label="Mission composer"
      className="bg-white border border-slate-200 rounded-xl p-5"
    >
      <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="mission-request"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            What information do you need?
          </label>
          <textarea
            id="mission-request"
            name="request"
            rows={2}
            value={request}
            onChange={(e) => onRequestChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder="Example: Compare the Scale and Enterprise monthly pricing, sustained API RPM, and uptime SLA credit schedule."
            aria-invalid={Boolean(requestError)}
            aria-describedby={requestError ? 'mission-request-error' : undefined}
            className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/60 focus:bg-white focus:outline-none transition-colors resize-none ${
              requestError
                ? 'border-red-400 focus:border-red-600'
                : 'border-slate-200 focus:border-blue-600'
            }`}
          />
          {requestError && (
            <p
              id="mission-request-error"
              role="alert"
              className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{requestError}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label
              htmlFor="mission-start-url"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Starting website URL{' '}
              <span className="font-normal text-slate-400">
                (optional — leave blank for automatic discovery)
              </span>
            </label>
            <div className="relative">
              <Globe
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="mission-start-url"
                name="startUrl"
                type="text"
                value={startUrl}
                onChange={(e) => onStartUrlChange(e.target.value)}
                disabled={isRunning}
                placeholder="https://example.org or /sandbox/harbor-cloud"
                aria-invalid={Boolean(urlError)}
                aria-describedby={urlError ? 'mission-url-error' : undefined}
                className={`w-full rounded-lg border pl-9 pr-3 py-2 text-sm font-mono text-slate-900 placeholder:font-sans placeholder:text-slate-400 bg-slate-50/60 focus:bg-white focus:outline-none transition-colors ${
                  urlError
                    ? 'border-red-400 focus:border-red-600'
                    : 'border-slate-200 focus:border-blue-600'
                }`}
              />
            </div>
            {urlError && (
              <p
                id="mission-url-error"
                role="alert"
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{urlError}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Output
              </span>
              <div
                role="group"
                aria-label="Output detail level"
                className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/80"
              >
                {OUTPUT_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    disabled={isRunning}
                    onClick={() => onOutputModeChange(mode.value)}
                    aria-pressed={outputMode === mode.value}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      outputMode === mode.value
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="mission-max-steps"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Depth
              </label>
              <select
                id="mission-max-steps"
                value={maxSteps}
                disabled={isRunning}
                onChange={(e) => onMaxStepsChange(Number(e.target.value))}
                className="h-[34px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
              >
                <option value={4}>4 steps</option>
                <option value={6}>6 steps</option>
                <option value={10}>10 steps</option>
              </select>
            </div>

            <div className="pt-5">
              {isRunning ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center justify-center gap-2 h-[38px] px-4 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  Stop Run
                </button>
              ) : (
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 h-[38px] px-4 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 transition-colors whitespace-nowrap shrink-0"
                >
                  Run Agent
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
