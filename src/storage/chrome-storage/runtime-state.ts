// Small pieces of runtime state that must survive service-worker suspension.
// Kept apart from user settings so frequent updates don't re-render every page.
import type { FocusState, LimitState } from '@/shared/types';
import { dayKey } from '@/shared/utils';

export const FOCUS_KEY = 'focusState';
export const LIMIT_KEY = 'limitState';
export const TRACK_KEY = 'usageCurrent';

export async function getFocusState(): Promise<FocusState> {
  const r = await chrome.storage.local.get(FOCUS_KEY);
  const v = r[FOCUS_KEY] as FocusState | undefined;
  return v && typeof v === 'object' && 'status' in v ? v : { status: 'idle' };
}

export function setFocusState(state: FocusState): Promise<void> {
  return chrome.storage.local.set({ [FOCUS_KEY]: state });
}

export async function getLimitState(now = new Date()): Promise<LimitState> {
  const r = await chrome.storage.local.get(LIMIT_KEY);
  const v = r[LIMIT_KEY] as LimitState | undefined;
  const today = dayKey(now);
  if (!v || v.date !== today || !Array.isArray(v.domains)) return { date: today, domains: [] };
  return v;
}

export function setLimitState(state: LimitState): Promise<void> {
  return chrome.storage.local.set({ [LIMIT_KEY]: state });
}

/** The active tracking segment. Session storage survives SW suspension but not a browser restart. */
export interface TrackingSegment {
  domain: string;
  since: number;
}

function sessionArea(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

export async function getSegment(): Promise<TrackingSegment | null> {
  const r = await sessionArea().get(TRACK_KEY);
  return (r[TRACK_KEY] as TrackingSegment | undefined) ?? null;
}

export function setSegment(seg: TrackingSegment | null): Promise<void> {
  return seg ? sessionArea().set({ [TRACK_KEY]: seg }) : sessionArea().remove(TRACK_KEY);
}
