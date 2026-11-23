import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkTargetUrlSafety,
  formatDisplayUrl,
  normalizeUserUrl,
  resolveAbsoluteHref,
} from './urlUtils';
import {
  extractHtmlTables,
  extractSectionByHeading,
  parseHtmlDocument,
  searchDocumentPassages,
} from './htmlParser';
import {
  filterMissionHistory,
  formatMissionAsJson,
  formatMissionAsMarkdown,
  validateMissionInput,
} from './exportUtils';
import type { MissionRun } from '../types/agent';

test('URL safety allows public HTTPS websites and local sandbox routes', () => {
  const publicRes = checkTargetUrlSafety('https://example.org/docs');
  assert.equal(publicRes.allowed, true);
  assert.equal(publicRes.normalizedUrl, 'https://example.org/docs');
  assert.equal(publicRes.isSandbox, false);

  const bareDomain = checkTargetUrlSafety('python.org/downloads');
  assert.equal(bareDomain.allowed, true);
  assert.equal(bareDomain.normalizedUrl, 'https://python.org/downloads');

  const sandboxRes = checkTargetUrlSafety('/sandbox/harbor-cloud/pricing');
  assert.equal(sandboxRes.allowed, true);
  assert.equal(sandboxRes.isSandbox, true);
});

test('URL safety blocks private IPs, localhost, and non-HTTP protocols', () => {
  assert.equal(checkTargetUrlSafety('http://127.0.0.1:8080/admin').allowed, false);
  assert.equal(checkTargetUrlSafety('http://169.254.169.254/latest/meta-data').allowed, false);
  assert.equal(checkTargetUrlSafety('http://10.0.0.5/internal').allowed, false);
  assert.equal(checkTargetUrlSafety('http://192.168.1.1').allowed, false);
  assert.equal(checkTargetUrlSafety('file:///etc/passwd').allowed, false);
  assert.equal(normalizeUserUrl('not a valid url'), null);
});

test('resolveAbsoluteHref resolves relative paths and ignores anchors/mailto', () => {
  assert.equal(
    resolveAbsoluteHref('/pricing#tiers', 'https://harbor.example/docs/intro'),
    'https://harbor.example/pricing'
  );
  assert.equal(
    resolveAbsoluteHref('mailto:team@example.com', 'https://harbor.example'),
    null
  );
  assert.equal(resolveAbsoluteHref('#section-2', 'https://harbor.example'), null);
  assert.equal(formatDisplayUrl('https://www.python.org/downloads/'), 'python.org/downloads/');
});

test('parseHtmlDocument extracts title, headings, clean text, links, and tables', () => {
  const sampleHtml = `
    <!doctype html>
    <html>
      <head>
        <title>Harbor Cloud API Limits</title>
        <meta name="description" content="Rate limits and throughput tiers." />
      </head>
      <body>
        <nav><a href="/sandbox/harbor-cloud/pricing">Pricing Plans</a></nav>
        <main>
          <h1>API Rate Limits</h1>
          <p>All workspaces receive burst protection and clear throughput caps.</p>
          <h2>Tier Quotas</h2>
          <p>Enterprise workspaces can request custom concurrency allocations.</p>
          <table>
            <caption>Requests per Minute by Plan</caption>
            <thead>
              <tr><th>Plan</th><th>Requests / Min</th><th>Burst Cap</th></tr>
            </thead>
            <tbody>
              <tr><td>Starter</td><td>120</td><td>200</td></tr>
              <tr><td>Scale</td><td>1,200</td><td>2,400</td></tr>
            </tbody>
          </table>
          <script>window.__ignored = "should not appear";</script>
        </main>
      </body>
    </html>
  `;

  const parsed = parseHtmlDocument(sampleHtml, 'http://127.0.0.1:3000/sandbox/harbor-cloud/limits');
  assert.equal(parsed.title, 'Harbor Cloud API Limits');
  assert.equal(parsed.description, 'Rate limits and throughput tiers.');
  assert.equal(parsed.headings.length, 2);
  assert.equal(parsed.headings[1].text, 'Tier Quotas');
  assert.equal(parsed.cleanText.includes('should not appear'), false);
  assert.equal(parsed.links.length, 1);
  assert.equal(parsed.links[0].href, 'http://127.0.0.1:3000/sandbox/harbor-cloud/pricing');

  const tables = extractHtmlTables(sampleHtml);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ['Plan', 'Requests / Min', 'Burst Cap']);
  assert.deepEqual(tables[0].rows[1], ['Scale', '1,200', '2,400']);

  const section = extractSectionByHeading(parsed, 'tier quotas');
  assert.ok(section);
  assert.ok(section.content.includes('custom concurrency allocations'));

  const matches = searchDocumentPassages(parsed.cleanText, 'burst protection');
  assert.ok(matches.length >= 1);
  assert.ok(matches[0].snippet.includes('burst protection'));
});

test('validateMissionInput enforces non-empty request and valid optional URL', () => {
  const emptyRes = validateMissionInput('   ', '');
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.requestError);

  const badUrlRes = validateMissionInput('Find the enterprise pricing tier', 'not-a-url');
  assert.equal(badUrlRes.valid, false);
  assert.ok(badUrlRes.urlError);

  const okRes = validateMissionInput('Find the latest pricing details', '/sandbox/harbor-cloud');
  assert.equal(okRes.valid, true);
});

test('history filtering and Markdown/JSON export produce structured output', () => {
  const mockRun: MissionRun = {
    id: 'run-1',
    request: 'Find Scale plan rate limits and SLA uptime',
    startUrl: '/sandbox/harbor-cloud',
    maxSteps: 6,
    outputMode: 'structured',
    status: 'completed',
    createdAt: '2026-11-22T10:00:00.000Z',
    totalDurationMs: 2400,
    steps: [
      {
        id: 's1',
        stepNumber: 1,
        action: 'open_url',
        label: 'Opened page',
        target: '/sandbox/harbor-cloud',
        status: 'completed',
        summary: 'Loaded portal home',
        durationMs: 42,
        httpStatus: 200,
        startedAt: '2026-11-22T10:00:00.000Z',
      },
    ],
    visitedPages: {},
    answer: {
      summary: 'The Scale plan includes 1,200 requests per minute and a 99.95% SLA.',
      keyFacts: [
        {
          label: 'Scale RPM',
          value: '1,200 req/min',
          sourceUrl: 'http://127.0.0.1:3000/sandbox/harbor-cloud/api-limits',
        },
      ],
      sources: [
        {
          title: 'API Rate Limits',
          url: 'http://127.0.0.1:3000/sandbox/harbor-cloud/api-limits',
          excerpt: 'Scale tier provides 1,200 requests/min with 2,400 burst capacity.',
        },
      ],
    },
  };

  assert.equal(filterMissionHistory([mockRun], 'SLA uptime').length, 1);
  assert.equal(filterMissionHistory([mockRun], 'nonexistent').length, 0);

  const md = formatMissionAsMarkdown(mockRun);
  assert.ok(md.includes('# Find Scale plan rate limits and SLA uptime'));
  assert.ok(md.includes('1,200 req/min'));

  const jsonParsed = JSON.parse(formatMissionAsJson(mockRun));
  assert.equal(jsonParsed.status, 'completed');
  assert.equal(jsonParsed.steps.length, 1);
});
