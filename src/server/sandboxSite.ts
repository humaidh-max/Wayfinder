import type { Express, Request, Response } from 'express';

function renderLayout(title: string, description: string, activePath: string, bodyHtml: string): string {
  const navItems = [
    { href: '/sandbox/harbor-cloud', label: 'Overview' },
    { href: '/sandbox/harbor-cloud/pricing', label: 'Pricing' },
    { href: '/sandbox/harbor-cloud/api-limits', label: 'API Limits' },
    { href: '/sandbox/harbor-cloud/changelog', label: 'Changelog' },
    { href: '/sandbox/harbor-cloud/security', label: 'Security & SLA' },
  ];

  const navLinks = navItems
    .map(
      (item) =>
        `<a href="${item.href}" style="margin-right:16px;font-weight:${
          item.href === activePath ? '700' : '500'
        };color:${item.href === activePath ? '#0f172a' : '#334155'};text-decoration:none;">${
          item.label
        }</a>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} — Harbor Cloud Documentation</title>
    <meta name="description" content="${description}" />
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; line-height: 1.6; }
      header { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
      main { max-width: 880px; margin: 32px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 32px; }
      h1 { margin-top: 0; font-size: 28px; }
      h2 { margin-top: 28px; font-size: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
      th { background: #f8fafc; font-weight: 600; }
      footer { max-width: 880px; margin: 0 auto 40px; color: #64748b; font-size: 13px; padding: 0 8px; }
    </style>
  </head>
  <body>
    <header>
      <strong>Harbor Cloud</strong>
      <nav aria-label="Primary navigation">${navLinks}</nav>
    </header>
    <main>
      ${bodyHtml}
    </main>
    <footer>
      <p>Harbor Cloud Sandbox Documentation Portal · Updated November 2026</p>
    </footer>
  </body>
</html>`;
}

const PAGES: Record<string, { title: string; description: string; body: string }> = {
  '/sandbox/harbor-cloud': {
    title: 'Overview',
    description: 'Harbor Cloud managed telemetry pipelines, event routing, and regional storage.',
    body: `
      <h1>Harbor Cloud Platform Overview</h1>
      <p>Harbor Cloud provides managed event ingestion, real-time stream transformation, and multi-region archival storage for engineering teams.</p>
      <h2>Explore Documentation</h2>
      <ul>
        <li><a href="/sandbox/harbor-cloud/pricing">Pricing &amp; Plan Comparison</a> — Compare Hobby, Growth, Scale, and Enterprise tiers, monthly costs, and included event volumes.</li>
        <li><a href="/sandbox/harbor-cloud/api-limits">API Rate Limits &amp; Throughput</a> — Review requests per minute, burst allowances, payload caps, and webhook concurrency limits.</li>
        <li><a href="/sandbox/harbor-cloud/changelog">Platform Changelog</a> — Track release versions, new ingestion connectors, and API deprecation dates.</li>
        <li><a href="/sandbox/harbor-cloud/security">Security, Residency &amp; Uptime SLA</a> — Inspect SOC 2 Type II certification, regional hosting options, and SLA credit schedules.</li>
      </ul>
      <h2>Core Architecture Highlights</h2>
      <p>Every workspace runs isolated ingestion queues with automatic schema validation and zero-downtime key rotation. Default ingestion endpoints are served from Frankfurt (eu-central-1), Virginia (us-east-1), and Singapore (ap-southeast-1).</p>
    `,
  },
  '/sandbox/harbor-cloud/pricing': {
    title: 'Pricing & Plans',
    description: 'Transparent subscription plans, included storage, seats, and support response SLAs.',
    body: `
      <h1>Pricing &amp; Plan Comparison</h1>
      <p>All plans include TLS 1.3 transport encryption, JSON schema validation, and instant webhook replay. Annual billing grants a 15% discount on base subscription fees.</p>
      <h2>Subscription Tiers</h2>
      <table>
        <caption>Harbor Cloud Monthly Subscription Tiers</caption>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Monthly Price</th>
            <th>Included Events</th>
            <th>Team Seats</th>
            <th>Log Retention</th>
            <th>Support Response</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hobby</td>
            <td>$0 / month</td>
            <td>500,000 events</td>
            <td>2 seats</td>
            <td>7 days</td>
            <td>Community forum</td>
          </tr>
          <tr>
            <td>Growth</td>
            <td>$79 / month</td>
            <td>15,000,000 events</td>
            <td>10 seats</td>
            <td>30 days</td>
            <td>Within 24 hours</td>
          </tr>
          <tr>
            <td>Scale</td>
            <td>$349 / month</td>
            <td>120,000,000 events</td>
            <td>35 seats</td>
            <td>90 days</td>
            <td>Within 4 hours</td>
          </tr>
          <tr>
            <td>Enterprise</td>
            <td>$1,450 / month</td>
            <td>1,000,000,000 events</td>
            <td>Unlimited</td>
            <td>365 days</td>
            <td>Within 30 minutes (24/7)</td>
          </tr>
        </tbody>
      </table>
      <h2>Overage &amp; Add-On Rates</h2>
      <p>Additional ingestion volume above included plan quotas is billed at $1.80 per million events on Growth, $1.20 per million events on Scale, and custom committed rates on Enterprise.</p>
      <p>Dedicated static egress IP pools are included at no extra cost on Scale and Enterprise plans, or $45/month as a Growth add-on.</p>
      <p>Need throughput details? Check the <a href="/sandbox/harbor-cloud/api-limits">API Rate Limits</a> page or review our <a href="/sandbox/harbor-cloud/security">Security &amp; SLA</a> commitments.</p>
    `,
  },
  '/sandbox/harbor-cloud/api-limits': {
    title: 'API Rate Limits',
    description: 'Throughput quotas, burst caps, payload ceilings, and retry headers across Harbor Cloud tiers.',
    body: `
      <h1>API Rate Limits &amp; Quotas</h1>
      <p>Harbor Cloud enforces token-bucket rate limits per workspace API key. Responses exceeding quota return HTTP 429 with an explicit <code>Retry-After</code> header in seconds.</p>
      <h2>Throughput Caps by Plan</h2>
      <table>
        <caption>API Throughput and Concurrency Limits</caption>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Sustained RPM</th>
            <th>Burst Cap (10s window)</th>
            <th>Max Payload Size</th>
            <th>Concurrent Webhooks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hobby</td>
            <td>120 req/min</td>
            <td>200 req</td>
            <td>256 KB</td>
            <td>4 workers</td>
          </tr>
          <tr>
            <td>Growth</td>
            <td>600 req/min</td>
            <td>1,000 req</td>
            <td>1 MB</td>
            <td>20 workers</td>
          </tr>
          <tr>
            <td>Scale</td>
            <td>2,400 req/min</td>
            <td>4,500 req</td>
            <td>5 MB</td>
            <td>80 workers</td>
          </tr>
          <tr>
            <td>Enterprise</td>
            <td>15,000 req/min</td>
            <td>30,000 req</td>
            <td>25 MB</td>
            <td>400 workers</td>
          </tr>
        </tbody>
      </table>
      <h2>Batch Ingestion Guidelines</h2>
      <p>The batch ingestion endpoint (<code>POST /v4/events/batch</code>) accepts up to 500 events per HTTP request on Hobby and Growth, and up to 2,500 events per request on Scale and Enterprise.</p>
      <p>For availability guarantees and service credits, visit <a href="/sandbox/harbor-cloud/security">Security &amp; SLA</a>.</p>
    `,
  },
  '/sandbox/harbor-cloud/changelog': {
    title: 'Changelog',
    description: 'Release history, feature launches, and deprecation notices for Harbor Cloud.',
    body: `
      <h1>Platform Changelog</h1>
      <p>Track recent platform releases, SDK improvements, and scheduled API lifecycle milestones.</p>
      <h2>Release 4.3.0 — November 14, 2026</h2>
      <p>Introduced streaming Parquet exports directly to object storage buckets, reducing cold-archive latency by 62%. Added per-route dead-letter inspection queues for Scale and Enterprise workspaces.</p>
      <h2>Release 4.2.0 — September 28, 2026</h2>
      <p>Launched the Tokyo (ap-northeast-1) regional ingestion cluster with full EU/APAC data pinning support. Increased Scale plan webhook worker concurrency from 50 to 80 workers.</p>
      <h2>Release 4.1.0 — July 19, 2026</h2>
      <p>Added deterministic payload signing using Ed25519 keys and native OpenTelemetry trace correlation headers.</p>
      <h2>Upcoming Deprecations</h2>
      <p>Legacy v2 webhook signing secrets (HMAC-SHA1) will be retired on March 31, 2027. Workspaces must migrate to v4 Ed25519 or HMAC-SHA256 signatures prior to that cutoff.</p>
    `,
  },
  '/sandbox/harbor-cloud/security': {
    title: 'Security & Uptime SLA',
    description: 'Compliance certifications, regional data residency, encryption controls, and uptime SLA credits.',
    body: `
      <h1>Security, Residency &amp; Uptime SLA</h1>
      <p>Harbor Cloud is independently audited for SOC 2 Type II and ISO 27001:2022 compliance. All stored event payloads are encrypted at rest using AES-256-GCM with workspace-isolated data encryption keys.</p>
      <h2>Data Residency Regions</h2>
      <p>Customers on Scale and Enterprise plans can pin ingestion and archival storage strictly within four isolated regions: Virginia (us-east-1), Frankfurt (eu-central-1), Singapore (ap-southeast-1), and Tokyo (ap-northeast-1). Zero cross-region replication occurs when strict residency mode is enabled.</p>
      <h2>Monthly Uptime SLA Guarantees</h2>
      <table>
        <caption>Uptime Commitment and Service Credit Schedule</caption>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Monthly Uptime SLA</th>
            <th>Credit (Below SLA)</th>
            <th>Credit (Below 99.0%)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hobby</td>
            <td>Best effort (no SLA)</td>
            <td>N/A</td>
            <td>N/A</td>
          </tr>
          <tr>
            <td>Growth</td>
            <td>99.50%</td>
            <td>10% monthly credit</td>
            <td>25% monthly credit</td>
          </tr>
          <tr>
            <td>Scale</td>
            <td>99.95%</td>
            <td>15% monthly credit</td>
            <td>35% monthly credit</td>
          </tr>
          <tr>
            <td>Enterprise</td>
            <td>99.99%</td>
            <td>25% monthly credit</td>
            <td>50% monthly credit</td>
          </tr>
        </tbody>
      </table>
      <h2>Vulnerability Disclosure</h2>
      <p>Security researchers can report findings to security@harborcloud.example with a guaranteed triage acknowledgement within 12 business hours.</p>
    `,
  },
};

export function registerSandboxRoutes(app: Express): void {
  Object.entries(PAGES).forEach(([routePath, page]) => {
    app.get(routePath, (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderLayout(page.title, page.description, routePath, page.body));
    });
  });
}
