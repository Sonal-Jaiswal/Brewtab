// NightShift: resolves the effective appearance for a site and produces the CSS.
// Shared by the content script, popup and settings page.
import type { NightShiftPrefs, NightShiftSettings } from '@/shared/types';
import { parseHm } from '@/shared/utils';
import { hostMatchesDomain } from '@/shared/utils/url';

export const NEUTRAL_PREFS: NightShiftPrefs = {
  dark: false,
  brightness: 100,
  contrast: 100,
  sepia: 0,
  fontScale: 100,
  fontFamily: 'default',
};

export function isScheduleWindow(schedule: NightShiftSettings['schedule'], now: Date): boolean {
  if (!schedule.enabled) return true;
  const start = parseHm(schedule.start);
  const end = parseHm(schedule.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return true;
  const m = now.getHours() * 60 + now.getMinutes();
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** Milliseconds until the schedule window next opens or closes. */
export function msUntilScheduleChange(schedule: NightShiftSettings['schedule'], now: Date): number | null {
  if (!schedule.enabled) return null;
  const start = parseHm(schedule.start);
  const end = parseHm(schedule.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null;
  const m = now.getHours() * 60 + now.getMinutes();
  const next = [start, end].map((t) => (t > m ? t - m : t + 1440 - m)).sort((a, b) => a - b)[0];
  return next * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}

export function isExcluded(settings: NightShiftSettings, host: string): boolean {
  return settings.excluded.some((d) => hostMatchesDomain(host, d));
}

/** Find the most specific per-site override for a host. */
export function siteKeyFor(settings: NightShiftSettings, host: string): string | null {
  const keys = Object.keys(settings.sites).filter((k) => hostMatchesDomain(host, k));
  return keys.sort((a, b) => b.length - a.length)[0] ?? null;
}

export interface Resolution {
  prefs: NightShiftPrefs | null;
  reason: 'module-off' | 'inactive' | 'excluded' | 'site-disabled' | 'outside-schedule' | 'applied';
}

export function resolvePrefs(settings: NightShiftSettings, moduleEnabled: boolean, host: string, now: Date): Resolution {
  if (!moduleEnabled) return { prefs: null, reason: 'module-off' };
  if (isExcluded(settings, host)) return { prefs: null, reason: 'excluded' };
  const key = siteKeyFor(settings, host);
  const override = key ? settings.sites[key] : undefined;
  if (override?.disabled) return { prefs: null, reason: 'site-disabled' };
  // A site with its own override is treated as explicitly enabled.
  if (!settings.active && !override) return { prefs: null, reason: 'inactive' };
  if (!isScheduleWindow(settings.schedule, now)) return { prefs: null, reason: 'outside-schedule' };
  return { prefs: { ...settings.global, ...(override?.prefs ?? {}) }, reason: 'applied' };
}

const FONT_STACKS: Record<Exclude<NightShiftPrefs['fontFamily'], 'default'>, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  readable: 'Verdana, "Atkinson Hyperlegible", Tahoma, sans-serif',
};

/** Elements whose colours must not be inverted twice. */
const MEDIA_SELECTORS = 'img, video, picture, canvas, svg image, iframe, embed, object, [style*="background-image"]';
/** Elements whose font must be left alone (icon fonts, code). */
const FONT_EXCLUDE = ':not(code):not(pre):not(kbd):not(samp):not(i):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"]):not(.material-icons):not([aria-hidden="true"])';

export function isNeutral(p: NightShiftPrefs): boolean {
  return !p.dark && p.brightness === 100 && p.contrast === 100 && p.sepia === 0 && p.fontScale === 100 && p.fontFamily === 'default';
}

/**
 * Build scoped CSS. Dark mode uses invert + hue-rotate on the root and
 * re-inverts media, which also handles content added later by SPAs.
 * `pageIsDark` lets us skip inversion on sites that already have a dark theme.
 */
export function buildCss(p: NightShiftPrefs, opts: { pageIsDark?: boolean } = {}): string {
  if (isNeutral(p)) return '';
  const invert = p.dark && !opts.pageIsDark;
  const filters: string[] = [];
  if (invert) filters.push('invert(1)', 'hue-rotate(180deg)');
  if (p.brightness !== 100) filters.push(`brightness(${p.brightness / 100})`);
  if (p.contrast !== 100) filters.push(`contrast(${p.contrast / 100})`);
  if (p.sepia > 0) filters.push(`sepia(${p.sepia / 100})`);

  const css: string[] = [];
  if (filters.length) {
    css.push(`html { filter: ${filters.join(' ')} !important; }`);
    if (invert) {
      css.push('html { background-color: #fff !important; }');
      css.push(`${MEDIA_SELECTORS} { filter: invert(1) hue-rotate(180deg) !important; }`);
      // Don't double-invert media nested in other re-inverted media.
      css.push(`:is(${MEDIA_SELECTORS}) :is(${MEDIA_SELECTORS}) { filter: none !important; }`);
    }
  }
  if (p.fontScale !== 100) {
    css.push(`html { font-size: ${p.fontScale}% !important; }`);
    css.push(`body p, body li, body td, body dd, body blockquote { font-size: ${p.fontScale / 100}em; }`);
  }
  if (p.fontFamily !== 'default') {
    css.push(`body, body *${FONT_EXCLUDE} { font-family: ${FONT_STACKS[p.fontFamily]} !important; }`);
  }
  return css.join('\n');
}

/** Relative luminance (0–1) of a CSS rgb()/rgba() colour, or null if transparent/unknown. */
export function luminance(color: string): number | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(color);
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
