// ScrollStop: keeps declarativeNetRequest dynamic rules in sync with settings,
// focus state, schedules and daily limits. Fully recomputed on every change so
// the service worker can be suspended at any time without losing state.
import { getSettings } from '@/storage/chrome-storage/settings';
import { getFocusState, getLimitState } from '@/storage/chrome-storage/runtime-state';
import { buildRules, currentBlockReason, isUrlBlockedBy, type RuleContext } from '@/modules/scrollstop/rules';
import { activeSchedules, nextScheduleBoundary } from '@/modules/scrollstop/schedule';
import { isFocusBlocking } from '@/modules/scrollstop/focus';
import { hasSiteAccess } from '@/shared/permissions';
import { ALARMS } from './alarms';

export async function buildContext(now = new Date()): Promise<{ ctx: RuleContext; settings: Awaited<ReturnType<typeof getSettings>> }> {
  const [settings, focus, limits, siteAccess] = await Promise.all([getSettings(), getFocusState(), getLimitState(now), hasSiteAccess()]);
  const ctx: RuleContext = {
    moduleEnabled: settings.modules.scrollstop,
    focusActive: isFocusBlocking(focus),
    scheduleActive: activeSchedules(settings.scrollstop.schedules, now).length > 0,
    limitDomains: limits.domains,
    canRedirect: siteAccess || __BREWTAB_E2E__,
    blockedPageUrl: chrome.runtime.getURL('blocked.html'),
  };
  return { ctx, settings };
}

let syncing: Promise<void> = Promise.resolve();

/** Serialised so overlapping triggers never race on rule IDs. */
export function syncBlocking(): Promise<void> {
  syncing = syncing.then(doSync, doSync);
  return syncing;
}

async function doSync(): Promise<void> {
  const now = new Date();
  const { ctx, settings } = await buildContext(now);
  const rules = buildRules(settings.scrollstop, ctx);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules,
  });

  // One alarm at the next schedule start/end instead of polling.
  const boundary = ctx.moduleEnabled ? nextScheduleBoundary(settings.scrollstop.schedules, now) : null;
  if (boundary) await chrome.alarms.create(ALARMS.scheduleBoundary, { when: boundary + 500 });
  else await chrome.alarms.clear(ALARMS.scheduleBoundary);

  // Rules only affect new navigations; move already-open blocked tabs too.
  if (rules.length && ctx.canRedirect) await redirectOpenTabs(rules);

  const reason = currentBlockReason(settings.scrollstop, ctx);
  await chrome.action.setBadgeBackgroundColor({ color: '#B4532A' }).catch(() => undefined);
  if (!ctx.focusActive) await chrome.action.setBadgeText({ text: reason ? '●' : '' }).catch(() => undefined);
}

async function redirectOpenTabs(rules: chrome.declarativeNetRequest.Rule[]): Promise<void> {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => [] as chrome.tabs.Tab[]);
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const rule = isUrlBlockedBy(rules, tab.url);
    const sub = rule?.action.redirect?.regexSubstitution;
    if (!sub) continue;
    await chrome.tabs.update(tab.id, { url: sub.replace('\\0', tab.url) }).catch(() => undefined);
  }
}
