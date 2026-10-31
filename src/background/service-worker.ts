// Brewtab service worker. Stateless by design: every wake-up rebuilds what it
// needs from chrome.storage / IndexedDB, so suspension never loses state.
import { onSettingsChanged, getSettings, updateSettings, SETTINGS_KEY } from '@/storage/chrome-storage/settings';
import { FOCUS_KEY, LIMIT_KEY, getFocusState, getLimitState, setLimitState } from '@/storage/chrome-storage/runtime-state';
import { dayKey, uid } from '@/shared/utils';
import { focusRepo, usageRepo } from '@/storage/indexeddb/repos';
import { hostOf } from '@/shared/utils/url';
import type { Message, Response, StatusResponse } from '@/shared/messages';
import { hasSiteAccess } from '@/shared/permissions';
import { currentBlockReason } from '@/modules/scrollstop/rules';
import { ALARMS, ensureRecurringAlarms, nextMidnight } from './alarms';
import { buildContext, syncBlocking } from './blocking';
import { focusAdvance, focusEnd, focusEndIfRunning, focusPause, focusResume, focusStart, updateFocusBadge } from './focus';
import { flushTracking, pruneOldUsage, recheckLimits, refreshTracking, registerUsageListeners } from './usage-tracker';

// ---------- Startup / recovery ----------

async function bootstrap(): Promise<void> {
  await ensureRecurringAlarms();
  await focusAdvance(); // catch up on phases that ended while suspended/closed
  const limits = await getLimitState();
  if (limits.date !== dayKey()) await setLimitState({ date: dayKey(), domains: [] });
  await Promise.allSettled([syncBlocking(), syncMenus(), refreshTracking()]);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
  }
  await bootstrap();
});

chrome.runtime.onStartup.addListener(() => void bootstrap());

// Runs on every service-worker start, including wake-ups after suspension.
void bootstrap();

// ---------- Reactive sync ----------

onSettingsChanged((s) => {
  if (!s.modules.scrollstop) void focusEndIfRunning();
  void syncBlocking();
  void syncMenus();
  void refreshTracking();
  void recheckLimits();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (FOCUS_KEY in changes || LIMIT_KEY in changes) void syncBlocking();
  if (SETTINGS_KEY in changes && !changes[SETTINGS_KEY].newValue) void bootstrap(); // cleared
});

chrome.permissions.onAdded.addListener(() => void bootstrap());
chrome.permissions.onRemoved.addListener(() => void bootstrap());

registerUsageListeners();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case ALARMS.focusPhase:
      await focusAdvance();
      break;
    case ALARMS.scheduleBoundary:
      await syncBlocking();
      break;
    case ALARMS.tick:
      await flushTracking();
      await updateFocusBadge();
      break;
    case ALARMS.dailyReset:
      await setLimitState({ date: dayKey(), domains: [] });
      await pruneOldUsage();
      await chrome.alarms.create(ALARMS.dailyReset, { when: nextMidnight() });
      break;
  }
});

// ---------- Messages ----------

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg).then(
    (data) => sendResponse({ ok: true, data } satisfies Response),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Response),
  );
  return true; // async response
});

async function handle(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case 'focus:start':
      return focusStart(msg.minutes);
    case 'focus:pause':
      return focusPause();
    case 'focus:resume':
      return focusResume();
    case 'focus:end':
      return focusEnd();
    case 'scrollstop:sync':
      return syncBlocking();
    case 'status:get':
      return getStatus();
  }
}

async function getStatus(): Promise<StatusResponse> {
  const { ctx, settings } = await buildContext();
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return {
    focus: await getFocusState(),
    blockReason: currentBlockReason(settings.scrollstop, ctx),
    scheduleActive: ctx.scheduleActive,
    limitDomains: ctx.limitDomains,
    siteAccess: await hasSiteAccess(),
    ruleCount: rules.length,
  };
}

// ---------- Context menu ----------

const BLOCK_MENU = 'scrollstop-block';

let menuSync: Promise<void> = Promise.resolve();
function syncMenus(): Promise<void> {
  menuSync = menuSync.then(buildMenus, buildMenus);
  return menuSync;
}

async function buildMenus(): Promise<void> {
  const s = await getSettings();
  await chrome.contextMenus.removeAll();
  if (!s.modules.scrollstop) return;
  chrome.contextMenus.create({
    id: BLOCK_MENU,
    title: 'ScrollStop: add this site to blocklist',
    contexts: ['page'] as unknown as [chrome.contextMenus.ContextType],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== BLOCK_MENU) return;
  const host = hostOf(tab?.url ?? info.pageUrl);
  if (!host) return;
  await updateSettings((s) => {
    if (!s.scrollstop.blocklist.some((r) => r.kind === 'domain' && r.value === host)) {
      s.scrollstop.blocklist.push({ id: uid('r_'), kind: 'domain', value: host, enabled: true, createdAt: Date.now() });
    }
  });
});

// ---------- E2E test hooks (compiled out of production builds) ----------

if (__BREWTAB_E2E__) {
  Object.assign(globalThis, {
    brewtabTest: {
      syncBlocking,
      flushTracking,
      refreshTracking,
      focusAdvance,
      bootstrap,
      getStatus,
      addUsage: (date: string, domain: string, seconds: number) => usageRepo.add(date, domain, seconds),
      usageFor: (date: string) => usageRepo.forDate(date),
      focusHistory: () => focusRepo.recent(10),
      getLimitState,
    },
  });
}
