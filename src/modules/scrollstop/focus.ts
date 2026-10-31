// Focus session state machine (Pomodoro-style work/break cycles).
// Pure transitions; the service worker persists state and schedules alarms.
import type { FocusConfig, FocusRecord, FocusState } from '@/shared/types';
import { uid } from '@/shared/utils';

type Active = Extract<FocusState, { status: 'running' | 'paused' }>;

export function startFocus(config: FocusConfig, now: number, minutesOverride?: number): FocusState {
  const minutes = minutesOverride ?? config.workMinutes;
  const duration = minutes * 60_000;
  return {
    status: 'running',
    phase: 'work',
    sessionId: uid('f_'),
    sessionStartedAt: now,
    cycle: 1,
    totalCycles: minutesOverride ? 1 : config.cycles,
    phaseDurationMs: duration,
    endsAt: now + duration,
    remainingMs: duration,
    focusedMs: 0,
    plannedMinutes: minutes * (minutesOverride ? 1 : config.cycles),
  };
}

export function pauseFocus(state: FocusState, now: number): FocusState {
  if (state.status !== 'running') return state;
  return { ...state, status: 'paused', remainingMs: Math.max(0, state.endsAt - now) };
}

export function resumeFocus(state: FocusState, now: number): FocusState {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'running', endsAt: now + state.remainingMs };
}

export function remainingMs(state: FocusState, now: number): number {
  if (state.status === 'idle') return 0;
  return state.status === 'running' ? Math.max(0, state.endsAt - now) : state.remainingMs;
}

/** Work time elapsed in the current phase, counting pauses correctly. */
function currentWorkElapsed(state: Active, now: number): number {
  if (state.phase !== 'work') return 0;
  return Math.max(0, state.phaseDurationMs - remainingMs(state, now));
}

export interface AdvanceResult {
  state: FocusState;
  /** Set when the whole session finished. */
  record: FocusRecord | null;
  /** Human-readable transition, for notifications/badges. */
  event: 'break-started' | 'work-started' | 'completed' | 'none';
}

/** Called when the current phase's alarm fires (or on recovery when endsAt has passed). */
export function advanceFocus(state: FocusState, config: FocusConfig, now: number): AdvanceResult {
  if (state.status !== 'running' || now < state.endsAt) return { state, record: null, event: 'none' };
  if (state.phase === 'work') {
    const focusedMs = state.focusedMs + state.phaseDurationMs;
    if (state.cycle >= state.totalCycles) {
      return { state: { status: 'idle' }, record: toRecord(state, focusedMs, state.endsAt, true), event: 'completed' };
    }
    const breakMs = config.breakMinutes * 60_000;
    const next: Active = {
      ...state,
      phase: 'break',
      focusedMs,
      phaseDurationMs: breakMs,
      endsAt: state.endsAt + breakMs,
      remainingMs: breakMs,
      status: config.autoStartBreaks ? 'running' : 'paused',
    };
    // If the SW slept through several phases, keep advancing.
    if (next.status === 'running' && now >= next.endsAt) return advanceFocus(next, config, now);
    return { state: next, record: null, event: 'break-started' };
  }
  const workMs = config.workMinutes * 60_000;
  const next: Active = {
    ...state,
    phase: 'work',
    cycle: state.cycle + 1,
    phaseDurationMs: workMs,
    endsAt: state.endsAt + workMs,
    remainingMs: workMs,
  };
  if (now >= next.endsAt) return advanceFocus(next, config, now);
  return { state: next, record: null, event: 'work-started' };
}

/** Ending early still records the focus time actually spent. */
export function endFocus(state: FocusState, now: number): AdvanceResult {
  if (state.status === 'idle') return { state, record: null, event: 'none' };
  const focusedMs = state.focusedMs + currentWorkElapsed(state, now);
  return { state: { status: 'idle' }, record: toRecord(state, focusedMs, now, false), event: 'completed' };
}

function toRecord(state: Active, focusedMs: number, endedAt: number, completed: boolean): FocusRecord {
  return {
    id: state.sessionId,
    startedAt: state.sessionStartedAt,
    endedAt,
    plannedMinutes: state.plannedMinutes,
    focusedMs,
    cyclesCompleted: completed ? state.totalCycles : state.cycle - (state.phase === 'work' ? 1 : 0),
    completed,
  };
}

export function isFocusBlocking(state: FocusState): boolean {
  return state.status !== 'idle' && state.phase === 'work';
}
