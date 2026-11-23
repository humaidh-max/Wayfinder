import type { MissionRun } from '../types/agent';
import { checkTargetUrlSafety, formatDisplayUrl } from './urlUtils';

export interface MissionValidationResult {
  valid: boolean;
  requestError?: string;
  urlError?: string;
}

export function validateMissionInput(
  request: string,
  startUrl: string
): MissionValidationResult {
  const trimmedRequest = request.trim();
  const trimmedUrl = startUrl.trim();

  let requestError: string | undefined;
  let urlError: string | undefined;

  if (!trimmedRequest) {
    requestError = 'Please enter a natural-language question or instruction.';
  } else if (trimmedRequest.length < 6) {
    requestError = 'Please provide a more specific request (at least 6 characters).';
  }

  if (trimmedUrl) {
    const safety = checkTargetUrlSafety(trimmedUrl);
    if (!safety.allowed) {
      urlError = safety.reason || 'Please enter a valid http:// or https:// website URL.';
    }
  }

  return {
    valid: !requestError && !urlError,
    requestError,
    urlError,
  };
}

export function filterMissionHistory(
  history: MissionRun[],
  query: string
): MissionRun[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return history;
  }
  return history.filter((run) => {
    const inRequest = run.request.toLowerCase().includes(needle);
    const inUrl = run.startUrl.toLowerCase().includes(needle);
    const inSummary = run.answer?.summary.toLowerCase().includes(needle) ?? false;
    return inRequest || inUrl || inSummary;
  });
}

export function formatMissionAsMarkdown(run: MissionRun): string {
  const lines: string[] = [];
  lines.push(`# ${run.request}`);
  lines.push('');
  if (run.startUrl) {
    lines.push(`- **Starting URL:** ${formatDisplayUrl(run.startUrl)}`);
  }
  lines.push(`- **Status:** ${run.status}`);
  lines.push(`- **Steps Taken:** ${run.steps.length}`);
  if (typeof run.totalDurationMs === 'number') {
    lines.push(`- **Duration:** ${(run.totalDurationMs / 1000).toFixed(1)}s`);
  }
  lines.push('');

  if (run.answer) {
    lines.push('## Summary');
    lines.push('');
    lines.push(run.answer.summary);
    lines.push('');

    if (run.answer.keyFacts.length > 0) {
      lines.push('## Extracted Facts');
      lines.push('');
      lines.push('| Field | Value | Source |');
      lines.push('| --- | --- | --- |');
      for (const fact of run.answer.keyFacts) {
        const src = fact.sourceUrl ? formatDisplayUrl(fact.sourceUrl) : '—';
        lines.push(
          `| ${fact.label.replace(/\|/g, '\\|')} | ${fact.value.replace(/\|/g, '\\|')} | ${src} |`
        );
      }
      lines.push('');
    }

    if (run.answer.table && run.answer.table.columns.length > 0) {
      lines.push(`## ${run.answer.table.title || 'Structured Table'}`);
      lines.push('');
      lines.push(`| ${run.answer.table.columns.join(' | ')} |`);
      lines.push(`| ${run.answer.table.columns.map(() => '---').join(' | ')} |`);
      for (const row of run.answer.table.rows) {
        lines.push(`| ${row.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`);
      }
      lines.push('');
    }

    if (run.answer.sources.length > 0) {
      lines.push('## Verified Sources');
      lines.push('');
      for (const source of run.answer.sources) {
        lines.push(`- **${source.title}** (${source.url})`);
        if (source.excerpt) {
          lines.push(`  > "${source.excerpt}"`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function formatMissionAsJson(run: MissionRun): string {
  return JSON.stringify(
    {
      id: run.id,
      request: run.request,
      startUrl: run.startUrl,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      totalDurationMs: run.totalDurationMs,
      answer: run.answer ?? null,
      steps: run.steps.map((s) => ({
        stepNumber: s.stepNumber,
        action: s.action,
        label: s.label,
        target: s.target,
        status: s.status,
        summary: s.summary,
        durationMs: s.durationMs,
        httpStatus: s.httpStatus,
      })),
    },
    null,
    2
  );
}
