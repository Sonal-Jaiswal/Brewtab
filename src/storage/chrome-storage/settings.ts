// User preferences live in chrome.storage.local under a single versioned key.
// Every read is merged onto defaults, so fields added in new versions appear
// automatically and older stored data is never discarded on update.
import type { Settings } from '@/shared/types';
import { deepMerge, isPlainObject, type DeepPartial } from '@/shared/utils';

export const SETTINGS_KEY = 'settings';
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  onboarded: false,
  profile: { name: '', customGreeting: '' },
  clock: { show: true, format: '24h', showSeconds: false, dateFormat: 'long', secondaryTimezone: null },
  search: { show: true, provider: 'default', customUrl: 'https://example.com/search?q=%s', openInNewTab: false },
  quickLinks: { show: true },
  appearance: {
    theme: 'minimal-light',
    background: { kind: 'theme' },
    backgroundOpacity: 1,
    backgroundBlur: 0,
    widgetOpacity: 0.86,
    textColor: 'auto',
    radius: 18,
    spacing: 'cozy',
    reduceMotion: 'system',
  },
  modules: { scrollstop: true, nightshift: true, snappage: true },
  scrollstop: {
    alwaysOn: false,
    blocklist: [],
    allowlist: [],
    schedules: [],
    limits: [],
    focus: { workMinutes: 25, breakMinutes: 5, cycles: 4, blockDuringFocus: true, autoStartBreaks: true },
    trackUsage: true,
    blockedMessage: 'This site is blocked right now. Your future self says thanks.',
  },
  nightshift: {
    active: false,
    autoApply: false,
    skipDarkSites: true,
    global: { dark: true, brightness: 100, contrast: 100, sepia: 0, fontScale: 100, fontFamily: 'default' },
    sites: {},
    excluded: [],
    schedule: { enabled: false, start: '19:00', end: '07:00' },
  },
  snappage: { defaultFormat: 'png', jpegQuality: 0.92, keepRecent: 20 },
};

/** Bring stored settings of any older version up to the current shape. */
export function migrateSettings(raw: unknown): Settings {
  if (!isPlainObject(raw)) return structuredClone(DEFAULT_SETTINGS);
  // Version-specific transforms go here, e.g. `if (raw.version < 2) { ... }`.
  const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), raw);
  return sanitizeSettings({ ...merged, version: SETTINGS_VERSION });
}

/** Guard against invalid values (e.g. from a hand-edited import). */
export function sanitizeSettings(s: Settings): Settings {
  const d = DEFAULT_SETTINGS;
  const themes = ['minimal-light', 'midnight', 'nature', 'glass'];
  if (!themes.includes(s.appearance.theme)) s.appearance.theme = d.appearance.theme;
  if (!['default', 'google', 'bing', 'duckduckgo', 'custom'].includes(s.search.provider)) s.search.provider = d.search.provider;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  s.appearance.backgroundOpacity = num(s.appearance.backgroundOpacity, 0, 1, d.appearance.backgroundOpacity);
  s.appearance.backgroundBlur = num(s.appearance.backgroundBlur, 0, 40, d.appearance.backgroundBlur);
  s.appearance.widgetOpacity = num(s.appearance.widgetOpacity, 0.2, 1, d.appearance.widgetOpacity);
  s.appearance.radius = num(s.appearance.radius, 0, 32, d.appearance.radius);
  for (const key of ['blocklist', 'allowlist', 'schedules', 'limits'] as const) {
    if (!Array.isArray(s.scrollstop[key])) (s.scrollstop[key] as unknown[]) = [];
  }
  if (!Array.isArray(s.nightshift.excluded)) s.nightshift.excluded = [];
  if (!isPlainObject(s.nightshift.sites)) s.nightshift.sites = {};
  const f = s.scrollstop.focus;
  f.workMinutes = num(f.workMinutes, 1, 240, d.scrollstop.focus.workMinutes);
  f.breakMinutes = num(f.breakMinutes, 1, 120, d.scrollstop.focus.breakMinutes);
  f.cycles = Math.round(num(f.cycles, 1, 12, d.scrollstop.focus.cycles));
  return s;
}

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return migrateSettings(res[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  } catch (err) {
    throw new StorageError('Could not save settings', err);
  }
}

/** Serialised read-modify-write so concurrent updates in one context don't clobber each other. */
let queue: Promise<unknown> = Promise.resolve();
export function updateSettings(patch: DeepPartial<Settings> | ((s: Settings) => Settings | void)): Promise<Settings> {
  const next = queue.then(async () => {
    const current = await getSettings();
    let updated: Settings;
    if (typeof patch === 'function') {
      const draft = structuredClone(current);
      updated = patch(draft) ?? draft;
    } else {
      updated = deepMerge(current, patch);
    }
    updated = sanitizeSettings(updated);
    await saveSettings(updated);
    return updated;
  });
  queue = next.catch(() => undefined);
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && SETTINGS_KEY in changes) cb(migrateSettings(changes[SETTINGS_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export class StorageError extends Error {
  readonly quota: boolean;
  constructor(message: string, cause?: unknown) {
    const quota = cause instanceof Error && /quota/i.test(`${cause.name} ${cause.message}`);
    super(quota ? `${message}: storage is full. Free up space by exporting and clearing old data.` : message);
    this.name = 'StorageError';
    this.quota = quota;
    this.cause = cause;
  }
}
