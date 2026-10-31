// NightShift content script. Injected either by dynamic registration (auto mode
// with site access) or on demand via activeTab. Idempotent: safe to inject twice.
import { buildCss, luminance, msUntilScheduleChange, resolvePrefs } from '@/modules/nightshift/engine';
import { migrateSettings, SETTINGS_KEY } from '@/storage/chrome-storage/settings';
import type { Settings } from '@/shared/types';

const STYLE_ID = 'brewtab-nightshift-style';

declare global {
  interface Window {
    __brewtabNightShift?: { refresh(): void };
  }
}

(() => {
  if (window.__brewtabNightShift) {
    window.__brewtabNightShift.refresh();
    return;
  }
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  const host = location.hostname.replace(/^www\./, '').toLowerCase();
  let settings: Settings | null = null;
  let css = '';
  let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
  let pageIsDark: boolean | undefined;

  function ensureStyle(): void {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!css) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      // documentElement exists at document_start even before <head>.
      (document.head ?? document.documentElement).appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  /** Detect sites that already use a dark theme so we don't invert them to light. */
  function detectDark(): boolean {
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const l = luminance(getComputedStyle(el).backgroundColor);
      if (l !== null) return l < 0.2;
    }
    return false;
  }

  function apply(): void {
    if (!settings) return;
    const { prefs } = resolvePrefs(settings.nightshift, settings.modules.nightshift, host, new Date());
    if (prefs?.dark && settings.nightshift.skipDarkSites && pageIsDark === undefined && document.body) {
      // Measure without our filter applied.
      document.getElementById(STYLE_ID)?.remove();
      pageIsDark = detectDark();
    }
    css = prefs ? buildCss(prefs, { pageIsDark: settings.nightshift.skipDarkSites ? pageIsDark : false }) : '';
    ensureStyle();
    clearTimeout(scheduleTimer);
    const ms = msUntilScheduleChange(settings.nightshift.schedule, new Date());
    if (ms !== null) scheduleTimer = setTimeout(apply, ms + 1000);
  }

  async function load(): Promise<void> {
    try {
      const res = await chrome.storage.local.get(SETTINGS_KEY);
      settings = migrateSettings(res[SETTINGS_KEY]);
      apply();
    } catch {
      // Extension was reloaded/removed: the old content script is orphaned.
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SETTINGS_KEY in changes) {
      settings = migrateSettings(changes[SETTINGS_KEY].newValue);
      apply();
    }
  });

  // Single-page apps and frameworks sometimes replace <head> or strip unknown
  // nodes; re-attach our style element when that happens.
  const observer = new MutationObserver(() => {
    if (css && !document.getElementById(STYLE_ID)) ensureStyle();
  });
  observer.observe(document.documentElement, { childList: true, subtree: false });
  document.addEventListener('DOMContentLoaded', () => {
    if (document.head) observer.observe(document.head, { childList: true });
    if (settings?.nightshift.skipDarkSites && pageIsDark === undefined) apply();
  });

  window.__brewtabNightShift = { refresh: () => void load() };
  void load();
})();
