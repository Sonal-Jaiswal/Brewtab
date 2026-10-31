// Alarm names and helpers. chrome.alarms survive service-worker suspension;
// in-memory timers do not, so every timed behaviour goes through here.
export const ALARMS = {
  focusPhase: 'focus-phase',
  scheduleBoundary: 'schedule-boundary',
  tick: 'tick',
  dailyReset: 'daily-reset',
} as const;

export function nextMidnight(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime();
}

/** Create the recurring alarms if they are missing (e.g. after a browser restart). */
export async function ensureRecurringAlarms(): Promise<void> {
  const tick = await chrome.alarms.get(ALARMS.tick);
  if (!tick) await chrome.alarms.create(ALARMS.tick, { periodInMinutes: 1 });
  const reset = await chrome.alarms.get(ALARMS.dailyReset);
  if (!reset) await chrome.alarms.create(ALARMS.dailyReset, { when: nextMidnight() });
}
