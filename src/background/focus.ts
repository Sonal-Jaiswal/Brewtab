// Focus session controller. State lives in chrome.storage.local; the phase end
// is a chrome.alarms alarm so sessions survive service-worker suspension and
// browser restarts (a phase that ended while Chrome was closed is caught up on start).
import { getSettings } from '@/storage/chrome-storage/settings';
import { getFocusState, setFocusState } from '@/storage/chrome-storage/runtime-state';
import { focusRepo } from '@/storage/indexeddb/repos';
import { advanceFocus, endFocus, pauseFocus, remainingMs, resumeFocus, startFocus, type AdvanceResult } from '@/modules/scrollstop/focus';
import type { FocusState } from '@/shared/types';
import { ALARMS } from './alarms';

async function commit(result: AdvanceResult | { state: FocusState; record: null; event: 'none' }): Promise<FocusState> {
  if (result.record && result.record.focusedMs > 0) await focusRepo.add(result.record);
  await setFocusState(result.state);
  await scheduleFocusAlarm(result.state);
  if (result.event !== 'none') notify(result.event);
  await updateFocusBadge(result.state);
  return result.state;
}

export async function scheduleFocusAlarm(state: FocusState): Promise<void> {
  if (state.status === 'running') await chrome.alarms.create(ALARMS.focusPhase, { when: state.endsAt });
  else await chrome.alarms.clear(ALARMS.focusPhase);
}

export async function focusStart(minutes?: number): Promise<FocusState> {
  const settings = await getSettings();
  const current = await getFocusState();
  if (current.status !== 'idle') return current;
  return commit({ state: startFocus(settings.scrollstop.focus, Date.now(), minutes), record: null, event: 'none' });
}

export async function focusPause(): Promise<FocusState> {
  return commit({ state: pauseFocus(await getFocusState(), Date.now()), record: null, event: 'none' });
}

export async function focusResume(): Promise<FocusState> {
  return commit({ state: resumeFocus(await getFocusState(), Date.now()), record: null, event: 'none' });
}

export async function focusEnd(): Promise<FocusState> {
  const r = endFocus(await getFocusState(), Date.now());
  return commit({ ...r, event: 'none' });
}

/** Alarm handler and startup recovery. */
export async function focusAdvance(): Promise<FocusState> {
  const settings = await getSettings();
  const state = await getFocusState();
  const r = advanceFocus(state, settings.scrollstop.focus, Date.now());
  if (r.event === 'none') {
    // Make sure a running session always has its alarm (e.g. after restart).
    await scheduleFocusAlarm(state);
    await updateFocusBadge(state);
    return state;
  }
  return commit(r);
}

export async function updateFocusBadge(state?: FocusState): Promise<void> {
  const s = state ?? (await getFocusState());
  if (s.status === 'idle') return;
  const mins = Math.ceil(remainingMs(s, Date.now()) / 60_000);
  const text = s.status === 'paused' ? '❚❚' : `${mins}m`;
  await chrome.action.setBadgeBackgroundColor({ color: s.phase === 'work' ? '#B4532A' : '#3F7D5B' }).catch(() => undefined);
  await chrome.action.setBadgeText({ text }).catch(() => undefined);
}

function notify(event: AdvanceResult['event']): void {
  const messages: Record<string, [string, string]> = {
    'break-started': ['Break time', 'Nice work. Step away for a few minutes.'],
    'work-started': ['Back to focus', 'Your next focus block has started.'],
    completed: ['Focus session complete', 'Session saved to your focus history.'],
  };
  const m = messages[event];
  if (!m || !chrome.notifications) return;
  chrome.notifications
    .create(`focus-${Date.now()}`, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title: m[0], message: m[1], silent: false })
    .catch(() => undefined);
}
