import type { DateFormat, SearchProvider, Settings } from '@/shared/types';
import { looksLikeUrl, ensureUrl } from '@/shared/utils/url';

export function greetingFor(date: Date, name: string, custom: string): string {
  const n = name.trim();
  if (custom.trim()) return custom.replace(/\{name\}/g, n).trim();
  const h = date.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
  return n ? `${part}, ${n}` : part;
}

export function formatTime(date: Date, clock: Settings['clock'], timeZone?: string): { time: string; period: string } {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: clock.showSeconds ? '2-digit' : undefined,
    hourCycle: clock.format === '24h' ? 'h23' : 'h12',
    timeZone,
  }).formatToParts(date);
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  const time = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();
  return { time, period };
}

export function formatDate(date: Date, format: DateFormat): string {
  switch (format) {
    case 'iso':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    case 'short':
      return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    case 'weekday':
      return date.toLocaleDateString(undefined, { weekday: 'long' });
    default:
      return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }
}

export const SEARCH_PROVIDERS: Record<Exclude<SearchProvider, 'custom' | 'default'>, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
};

export function providerName(p: SearchProvider): string {
  if (p === 'default') return 'Chrome default';
  return p === 'custom' ? 'Custom' : SEARCH_PROVIDERS[p].name;
}

export function isValidSearchTemplate(t: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(t.trim()) && t.includes('%s');
}

export type QueryTarget = { kind: 'url'; url: string } | { kind: 'chrome-search'; text: string };

/**
 * Turn what the user typed into a destination: a URL to open, or a search via
 * Chrome's default engine (chrome.search), which respects the user's own setting.
 */
export function resolveTarget(query: string, provider: SearchProvider, customUrl: string): QueryTarget | null {
  const q = query.trim();
  if (!q) return null;
  if (looksLikeUrl(q)) {
    const url = ensureUrl(q);
    if (url) return { kind: 'url', url };
  }
  if (provider === 'default') return { kind: 'chrome-search', text: q };
  const template = provider === 'custom' ? (isValidSearchTemplate(customUrl) ? customUrl : null) : SEARCH_PROVIDERS[provider].url;
  if (!template) return { kind: 'chrome-search', text: q };
  return { kind: 'url', url: template.replace('%s', encodeURIComponent(q)) };
}

/** URL form of resolveTarget for explicit providers (used in tests and fallbacks). */
export function resolveQuery(query: string, provider: SearchProvider, customUrl: string): string | null {
  const t = resolveTarget(query, provider, customUrl);
  if (!t) return null;
  return t.kind === 'url' ? t.url : SEARCH_PROVIDERS.google.url.replace('%s', encodeURIComponent(t.text));
}
