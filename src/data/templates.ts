import type { MissionTemplate } from '../types/agent';

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'harbor-scale-audit',
    title: 'Compare Scale vs Enterprise limits & SLA',
    request:
      'Navigate the Harbor Cloud docs to compare the Scale and Enterprise plans across monthly price, sustained API requests per minute, max payload size, and monthly uptime SLA credits.',
    startUrl: '/sandbox/harbor-cloud',
    scopeLabel: 'Multi-page sandbox · 3 pages',
    outputMode: 'structured',
    maxSteps: 6,
  },
  {
    id: 'harbor-changelog-residency',
    title: 'Find deprecation cutoff & data residency regions',
    request:
      'Find when legacy v2 webhook signing secrets are being retired, which new region was launched in Release 4.2.0, and list all four data residency regions available for strict pinning.',
    startUrl: '/sandbox/harbor-cloud',
    scopeLabel: 'Multi-page sandbox · 2 pages',
    outputMode: 'structured',
    maxSteps: 6,
  },
  {
    id: 'python-latest-release',
    title: 'Check latest Python release on python.org',
    request:
      'Navigate python.org to find the latest stable Python release version, its release date, and any active bugfix release series currently listed on the downloads page.',
    startUrl: 'https://www.python.org',
    scopeLabel: 'Live website · python.org',
    outputMode: 'concise',
    maxSteps: 6,
  },
  {
    id: 'open-web-discovery',
    title: 'Discover & extract HTTP 429 Retry-After spec',
    request:
      'Find the official MDN documentation for the HTTP 429 Too Many Requests status code and extract what headers servers should send with it and the two formats Retry-After accepts.',
    startUrl: '',
    scopeLabel: 'Auto web discovery',
    outputMode: 'structured',
    maxSteps: 6,
  },
];
