// ScrollStop usage tracking: credits time to the domain of the active tab in
// the focused window while the user is not idle.
//
// Accuracy limits (shown in the UI too): time is not counted while Chrome is
// closed, the computer sleeps, or the user is idle for 60s+. Each segment is
// flushed every minute and capped (MAX_SEGMENT_SECONDS) so a missed event can
// over-count by at most ~2 minutes. Requires optional site access to read URLs.
import { getSettings } from '@/storage/chrome-storage/settings';
import { getLimitState, getSegment, setLimitState, setSegment } from '@/storage/chrome-storage/runtime-state';
import { usageRepo } from '@/storage/indexeddb/repos';
import { exceededLimits, splitByDay } from '@/modules/scrollstop/usage';
import { dayKey, addDays } from '@/shared/utils';
import { hostOf } from '@/shared/utils/url';

export const IDLE_SECONDS = 60;
const RETENTION_DAYS = 90;

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function trackingEnabled(): Promise<boolean> {
  const s = await getSettings();
  return s.modules.scrollstop && s.scrollstop.trackUsage;
}

async function activeDomain(): Promise<string | null> {
  try {
    const state = await chrome.idle.queryState(IDLE_SECONDS);
    if (state !== 'active') return null;
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (!win?.focused || win.id === undefined) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    return hostOf(tab?.url);
  } catch {
    return null;
  }
}

/** Close the current segment (crediting its time) and open a new one. */
async function roll(nextDomain: string | null, now = Date.now()): Promise<void> {
  const seg = await getSegment();
  if (seg) await credit(seg.domain, seg.since, now);
  await setSegment(nextDomain ? { domain: nextDomain, since: now } : null);
}

async function credit(domain: string, since: number, now: number): Promise<void> {
  const parts = splitByDay(since, now).filter((p) => p.seconds >= 1);
  for (const p of parts) await usageRepo.add(p.date, domain, Math.round(p.seconds));
  if (parts.length) await checkLimits();
}

/** Recomputed from scratch, so removing, turning off or raising a limit unblocks the site right away. */
async function checkLimits(): Promise<void> {
  const settings = await getSettings();
  const limits = settings.scrollstop.limits.filter((l) => l.enabled);
  const state = await getLimitState();
  if (!limits.length && !state.domains.length) return;
  const today = dayKey();
  const exceeded = exceededLimits(limits, await usageRepo.forDate(today)).sort();
  if (exceeded.join() !== [...state.domains].sort().join()) await setLimitState({ date: today, domains: exceeded });
}

/** Call when limits may have changed in settings. */
export function recheckLimits(): Promise<void> {
  return serial(checkLimits);
}

/** Re-evaluate what (if anything) is being tracked. Call on any relevant browser event. */
export function refreshTracking(): Promise<void> {
  return serial(async () => {
    const domain = (await trackingEnabled()) ? await activeDomain() : null;
    const seg = await getSegment();
    if (seg && seg.domain === domain) return;
    await roll(domain);
  });
}

/** Called every minute: credit time so far, keep the same segment going. */
export function flushTracking(): Promise<void> {
  return serial(async () => {
    const domain = (await trackingEnabled()) ? await activeDomain() : null;
    await roll(domain);
  });
}

export function stopTracking(): Promise<void> {
  return serial(() => roll(null));
}

export async function pruneOldUsage(): Promise<void> {
  await usageRepo.pruneBefore(dayKey(addDays(new Date(), -RETENTION_DAYS)));
}

export function registerUsageListeners(): void {
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
  chrome.tabs.onActivated.addListener(() => void refreshTracking());
  chrome.tabs.onUpdated.addListener((_id, info, tab) => {
    if (tab.active && (info.url || info.status === 'complete')) void refreshTracking();
  });
  chrome.windows.onFocusChanged.addListener(() => void refreshTracking());
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === 'active') void refreshTracking();
    else void stopTracking();
  });
}
