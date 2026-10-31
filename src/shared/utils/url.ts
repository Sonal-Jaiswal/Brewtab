// URL and hostname helpers used for blocking, usage tracking and link deduplication.

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-untrusted://',
  'chrome-search://',
  'devtools://',
  'edge://',
  'about:',
  'view-source:',
  'data:',
  'javascript:',
  'file://',
];

const RESTRICTED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

/** True when Chrome forbids extensions from acting on the page. */
export function isRestrictedUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  if (RESTRICTED_PREFIXES.some((p) => lower.startsWith(p))) return true;
  try {
    const u = new URL(url);
    if (u.hostname === 'chrome.google.com') return u.pathname.startsWith('/webstore');
    return RESTRICTED_HOSTS.includes(u.hostname);
  } catch {
    return true;
  }
}

/** Hostname of an http(s) URL without a leading "www.", or null. */
export function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normalise user input like "https://www.YouTube.com/watch?v=1" to "youtube.com".
 * Returns null if the input is not a plausible hostname.
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z*]+:\/\//, '');
  s = s.split(/[/?#]/)[0];
  s = s.replace(/:\d+$/, '');
  s = s.replace(/^\*\./, '').replace(/^www\./, '');
  if (!HOST_RE.test(s)) return null;
  if (!s.includes('.') && s !== 'localhost') return null;
  return s;
}

/** True when `host` equals `domain` or is a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Add https:// when the user typed a bare domain. */
export function ensureUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!['http:', 'https:', 'chrome:', 'file:', 'chrome-extension:'].includes(u.protocol)) return null;
    if ((u.protocol === 'http:' || u.protocol === 'https:') && !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Canonical form used to detect duplicate shortcuts. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Heuristic for the search bar: does the query look like a URL to open directly? */
export function looksLikeUrl(q: string): boolean {
  const s = q.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^(https?|chrome|file):\/\//i.test(s)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(s)) return true;
  return /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s);
}
