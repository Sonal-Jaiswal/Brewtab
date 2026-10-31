// Typed messages between extension pages / content scripts and the service worker.
import type { FocusState } from './types';

export type CaptureMode = 'visible' | 'region' | 'fullpage';

export type Message =
  | { type: 'focus:start'; minutes?: number }
  | { type: 'focus:pause' }
  | { type: 'focus:resume' }
  | { type: 'focus:end' }
  | { type: 'scrollstop:sync' }
  | { type: 'snap:capture'; mode: CaptureMode; tabId: number; windowId: number }
  | { type: 'snap:region-selected'; rect: { x: number; y: number; w: number; h: number }; viewportWidth: number }
  | { type: 'snap:region-cancel' }
  | { type: 'status:get' };

export interface StatusResponse {
  focus: FocusState;
  blockReason: string | null;
  scheduleActive: boolean;
  limitDomains: string[];
  siteAccess: boolean;
  ruleCount: number;
}

export type Response<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

export async function send<T = unknown>(msg: Message): Promise<Response<T>> {
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as Response<T> | undefined;
    return res ?? { ok: false, error: 'No response from background' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
