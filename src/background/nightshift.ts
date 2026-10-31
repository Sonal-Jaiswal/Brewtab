// NightShift: registers the appearance content script dynamically, and only
// when the user enabled automatic mode AND granted optional site access.
// Without site access, NightShift still works per tab via activeTab (popup).
import { getSettings } from '@/storage/chrome-storage/settings';
import { hasSiteAccess } from '@/shared/permissions';
import { isRestrictedUrl } from '@/shared/utils/url';

const SCRIPT_ID = 'brewtab-nightshift';
export const NIGHTSHIFT_FILE = 'content/nightshift.js';

function matches(): string[] {
  return __BREWTAB_E2E__ ? ['http://localhost/*', 'http://127.0.0.1/*'] : ['*://*/*'];
}

let syncing: Promise<void> = Promise.resolve();

/** Serialised: overlapping calls (settings + permission events) must not double-register. */
export function syncNightShift(): Promise<void> {
  syncing = syncing.then(doSync, doSync);
  return syncing;
}

async function doSync(): Promise<void> {
  const s = await getSettings();
  const access = __BREWTAB_E2E__ || (await hasSiteAccess());
  const want = s.modules.nightshift && s.nightshift.autoApply && access;
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => []);
  if (want && existing.length === 0) {
    await chrome.scripting.registerContentScripts([
      { id: SCRIPT_ID, js: [NIGHTSHIFT_FILE], matches: matches(), runAt: 'document_start', allFrames: false, persistAcrossSessions: true },
    ]);
    await injectIntoOpenTabs();
  } else if (!want && existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
}

/** Newly registered scripts only run on future loads; cover tabs already open. */
async function injectIntoOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: matches() }).catch(() => [] as chrome.tabs.Tab[]);
  await Promise.all(
    tabs
      .filter((t) => t.id !== undefined && !isRestrictedUrl(t.url))
      .map((t) => chrome.scripting.executeScript({ target: { tabId: t.id! }, files: [NIGHTSHIFT_FILE] }).catch(() => undefined)),
  );
}
