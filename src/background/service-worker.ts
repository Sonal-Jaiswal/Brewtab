// Brewtab service worker. Stateless by design: every wake-up rebuilds what it
// needs from chrome.storage / IndexedDB, so suspension never loses state.
import { onSettingsChanged, getSettings, updateSettings, SETTINGS_KEY } from '@/storage/chrome-storage/settings';
import { FOCUS_KEY, LIMIT_KEY, getFocusState, getLimitState, setLimitState } from '@/storage/chrome-storage/runtime-state';
import { dayKey, uid } from '@/shared/utils';
import { focusRepo, usageRepo } from '@/storage/indexeddb/repos';
import { hostOf, isRestrictedUrl } from '@/shared/utils/url';
import type { Message, Response, StatusResponse } from '@/shared/messages';
import { hasSiteAccess } from '@/shared/permissions';
import { currentBlockReason } from '@/modules/scrollstop/rules';
import { ALARMS, ensureRecurringAlarms, nextMidnight } from './alarms';
import { buildContext, syncBlocking } from './blocking';
import { focusAdvance, focusEnd, focusPause, focusResume, focusStart, updateFocusBadge } from './focus';
import { flushTracking, pruneOldUsage, refreshTracking, registerUsageListeners } from './usage-tracker';
import { syncNightShift, NIGHTSHIFT_FILE } from './nightshift';
import { CaptureError, captureFullPage, captureVisible, finishRegionCapture, startRegionCapture } from './snappage';

// ---------- Startup / recovery ----------

async function bootstrap(): Promise<void> {
  await ensureRecurringAlarms();
  await focusAdvance(); // catch up on phases that ended while suspended/closed
  const limits = await getLimitState();
  if (limits.date !== dayKey()) await setLimitState({ date: dayKey(), domains: [] });
  await Promise.allSettled([syncBlocking(), syncNightShift(), syncMenus(), refreshTracking()]);
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

onSettingsChanged(() => {
  void syncBlocking();
  void syncNightShift();
  void syncMenus();
  void refreshTracking();
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

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  handle(msg, sender).then(
    (data) => sendResponse({ ok: true, data } satisfies Response),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Response),
  );
  return true; // async response
});

async function handle(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
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
    case 'snap:capture': {
      const tab = await chrome.tabs.get(msg.tabId);
      if (msg.mode === 'visible') return captureVisible(tab);
      if (msg.mode === 'region') return startRegionCapture(tab);
      void runFullPage(tab);
      return null;
    }
    case 'snap:region-selected':
      if (!sender.tab) throw new Error('No tab');
      return finishRegionCapture(sender.tab, msg.rect, msg.viewportWidth).catch(reportCaptureError);
    case 'snap:region-cancel':
      return null;
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

async function runFullPage(tab: chrome.tabs.Tab): Promise<void> {
  try {
    await captureFullPage(tab, (pct) => void chrome.action.setBadgeText({ text: `${pct}%`, tabId: tab.id }).catch(() => undefined));
  } catch (err) {
    reportCaptureError(err);
  } finally {
    await chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => undefined);
  }
}

function reportCaptureError(err: unknown): null {
  const message = err instanceof CaptureError ? err.message : `SnapPage couldn’t finish the capture. ${err instanceof Error ? err.message : ''}`;
  chrome.notifications
    ?.create(`snap-${Date.now()}`, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title: 'SnapPage', message })
    .catch(() => undefined);
  return null;
}

// ---------- Context menus & keyboard commands ----------

const MENU = {
  root: 'brewtab',
  snapVisible: 'snap-visible',
  snapRegion: 'snap-region',
  snapFull: 'snap-fullpage',
  reader: 'nightshift-reader',
  nightSite: 'nightshift-site',
  block: 'scrollstop-block',
} as const;

let menuSync: Promise<void> = Promise.resolve();
function syncMenus(): Promise<void> {
  menuSync = menuSync.then(buildMenus, buildMenus);
  return menuSync;
}

async function buildMenus(): Promise<void> {
  const s = await getSettings();
  await chrome.contextMenus.removeAll();
  const contexts = ['page'] as unknown as [chrome.contextMenus.ContextType];
  const docs = ['http://*/*', 'https://*/*'];
  const items: chrome.contextMenus.CreateProperties[] = [];
  if (s.modules.snappage) {
    items.push(
      { id: MENU.snapVisible, title: 'SnapPage: capture visible area' },
      { id: MENU.snapRegion, title: 'SnapPage: capture a region' },
      { id: MENU.snapFull, title: 'SnapPage: capture full page' },
    );
  }
  if (s.modules.nightshift) {
    items.push({ id: MENU.reader, title: 'NightShift: reading mode' }, { id: MENU.nightSite, title: 'NightShift: toggle on this site' });
  }
  if (s.modules.scrollstop) items.push({ id: MENU.block, title: 'ScrollStop: block this site' });
  if (!items.length) return;
  chrome.contextMenus.create({ id: MENU.root, title: 'Brewtab', contexts, documentUrlPatterns: docs });
  for (const item of items) chrome.contextMenus.create({ ...item, parentId: MENU.root, contexts, documentUrlPatterns: docs });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    switch (info.menuItemId) {
      case MENU.snapVisible:
        await captureVisible(tab);
        break;
      case MENU.snapRegion:
        await startRegionCapture(tab);
        break;
      case MENU.snapFull:
        await runFullPage(tab);
        break;
      case MENU.reader:
        if (!isRestrictedUrl(tab.url)) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/reader.js'] });
        break;
      case MENU.nightSite:
        await toggleNightShiftForSite(tab);
        break;
      case MENU.block: {
        const host = hostOf(tab.url ?? info.pageUrl);
        if (!host) break;
        await updateSettings((s) => {
          if (!s.scrollstop.blocklist.some((r) => r.kind === 'domain' && r.value === host)) {
            s.scrollstop.blocklist.push({ id: uid('r_'), kind: 'domain', value: host, enabled: true, createdAt: Date.now() });
          }
        });
        break;
      }
    }
  } catch (err) {
    reportCaptureError(err);
  }
});

async function toggleNightShiftForSite(tab: chrome.tabs.Tab): Promise<void> {
  const host = hostOf(tab.url);
  if (!host || !tab.id) return;
  await updateSettings((s) => {
    const cur = s.nightshift.sites[host];
    if (cur && !cur.disabled) s.nightshift.sites[host] = { ...cur, disabled: true };
    else s.nightshift.sites[host] = { ...(cur ?? {}), disabled: false, prefs: cur?.prefs ?? {} };
  });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [NIGHTSHIFT_FILE] }).catch(() => undefined);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;
  const settings = await getSettings();
  if (!settings.modules.snappage) return;
  try {
    if (command === 'snap-visible') await captureVisible(tab);
    if (command === 'snap-region') await startRegionCapture(tab);
  } catch (err) {
    reportCaptureError(err);
  }
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
      syncNightShift,
      getStatus,
      captureVisible: async (tabId: number) => captureVisible(await chrome.tabs.get(tabId)),
      captureFullPage: async (tabId: number) => captureFullPage(await chrome.tabs.get(tabId)),
      addUsage: (date: string, domain: string, seconds: number) => usageRepo.add(date, domain, seconds),
      usageFor: (date: string) => usageRepo.forDate(date),
      focusHistory: () => focusRepo.recent(10),
      getLimitState,
    },
  });
}
