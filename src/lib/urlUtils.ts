const PRIVATE_IPV4_PATTERNS = [
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

export function isSandboxPath(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/sandbox/') || trimmed === '/sandbox') {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    const isLocalHost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return (
      isLocalHost &&
      (parsed.pathname === '/sandbox' || parsed.pathname.startsWith('/sandbox/'))
    );
  } catch {
    return false;
  }
}

export function normalizeUserUrl(
  rawUrl: string,
  localOrigin = 'http://127.0.0.1:3000'
): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('/sandbox')) {
    return new URL(trimmed, localOrigin).toString();
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export interface UrlSafetyResult {
  allowed: boolean;
  normalizedUrl?: string;
  isSandbox?: boolean;
  reason?: string;
}

export function checkTargetUrlSafety(
  rawUrl: string,
  localOrigin = 'http://127.0.0.1:3000'
): UrlSafetyResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { allowed: false, reason: 'URL cannot be empty.' };
  }

  if (isSandboxPath(trimmed)) {
    try {
      const targetPath = trimmed.startsWith('/')
        ? trimmed
        : new URL(trimmed).pathname + new URL(trimmed).search;
      const normalized = new URL(targetPath, localOrigin).toString();
      return { allowed: true, normalizedUrl: normalized, isSandbox: true };
    } catch {
      return { allowed: false, reason: 'Invalid sandbox path.' };
    }
  }

  const normalized = normalizeUserUrl(trimmed, localOrigin);
  if (!normalized) {
    return {
      allowed: false,
      reason: 'Please enter a valid http:// or https:// website URL.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { allowed: false, reason: 'Malformed URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      allowed: false,
      reason: 'Only http and https URLs are supported.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return {
      allowed: false,
      reason: 'Private or local network addresses cannot be fetched.',
    };
  }

  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(host))) {
    return {
      allowed: false,
      reason: 'Private IP ranges cannot be fetched.',
    };
  }

  if (host.startsWith('[') && (host.includes('::1') || host.includes('fe80') || host.includes('fc') || host.includes('fd'))) {
    return {
      allowed: false,
      reason: 'Private IPv6 addresses cannot be fetched.',
    };
  }

  return { allowed: true, normalizedUrl: parsed.toString(), isSandbox: false };
}

export function resolveAbsoluteHref(href: string, baseUrl: string): string | null {
  const clean = href.trim();
  if (
    !clean ||
    clean.startsWith('#') ||
    clean.startsWith('javascript:') ||
    clean.startsWith('mailto:') ||
    clean.startsWith('tel:')
  ) {
    return null;
  }

  try {
    const resolved = new URL(clean, baseUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

export function formatDisplayUrl(rawUrl: string): string {
  if (!rawUrl) {
    return '';
  }
  if (rawUrl.startsWith('/sandbox')) {
    return `sandbox.local${rawUrl}`;
  }
  try {
    const parsed = new URL(rawUrl);
    if (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.pathname.startsWith('/sandbox')
    ) {
      return `sandbox.local${parsed.pathname}`;
    }
    const host = parsed.hostname.replace(/^www\./, '');
    const pathPart = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${host}${pathPart}`;
  } catch {
    return rawUrl;
  }
}

export function getDisplayHostname(rawUrl: string): string {
  if (!rawUrl) {
    return 'Web discovery';
  }
  if (isSandboxPath(rawUrl)) {
    return 'sandbox.local';
  }
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}
