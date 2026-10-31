import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushTracking, refreshTracking, stopTracking } from '@/background/usage-tracker';
import { usageRepo } from '@/storage/indexeddb/repos';
import { getLimitState, getSegment } from '@/storage/chrome-storage/runtime-state';
import { updateSettings } from '@/storage/chrome-storage/settings';
import { dayKey } from '@/shared/utils';

let idle: 'active' | 'idle' | 'locked' = 'active';
let focused = true;
let url: string | undefined = 'https://www.youtube.com/watch?v=1';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 31, 10, 0, 0));
  idle = 'active';
  focused = true;
  url = 'https://www.youtube.com/watch?v=1';
  Object.assign(chrome, {
    idle: { queryState: async () => idle },
    windows: { getLastFocused: async () => ({ id: 1, focused }) },
    tabs: { query: async () => [{ id: 1, url }] },
  });
});
afterEach(() => vi.useRealTimers());

const advance = (s: number) => vi.setSystemTime(Date.now() + s * 1000);

describe('usage tracker', () => {
  it('credits time to the active domain on flush', async () => {
    await refreshTracking();
    expect((await getSegment())?.domain).toBe('youtube.com');
    advance(45);
    await flushTracking();
    const recs = await usageRepo.forDate(dayKey());
    expect(recs).toEqual([expect.objectContaining({ domain: 'youtube.com', seconds: 45 })]);
  });

  it('switching tabs closes the old segment', async () => {
    await refreshTracking();
    advance(20);
    url = 'https://github.com/x';
    await refreshTracking();
    advance(10);
    await flushTracking();
    const recs = await usageRepo.forDate(dayKey());
    expect(Object.fromEntries(recs.map((r) => [r.domain, r.seconds]))).toEqual({ 'youtube.com': 20, 'github.com': 10 });
  });

  it('does not count idle time, unfocused windows or non-web pages', async () => {
    idle = 'idle';
    await refreshTracking();
    expect(await getSegment()).toBeNull();
    idle = 'active';
    focused = false;
    await refreshTracking();
    expect(await getSegment()).toBeNull();
    focused = true;
    url = 'chrome://settings';
    await refreshTracking();
    expect(await getSegment()).toBeNull();
  });

  it('caps a segment after a long gap (sleep / suspended worker)', async () => {
    await refreshTracking();
    advance(3 * 3600);
    await flushTracking();
    expect((await usageRepo.forDate(dayKey()))[0].seconds).toBe(120);
  });

  it('stops tracking when the user goes idle', async () => {
    await refreshTracking();
    advance(30);
    await stopTracking();
    advance(300);
    await flushTracking();
    expect((await usageRepo.forDate(dayKey()))[0].seconds).toBe(30);
  });

  it('respects the tracking setting', async () => {
    await updateSettings({ scrollstop: { trackUsage: false } });
    await refreshTracking();
    expect(await getSegment()).toBeNull();
  });

  it('adds a domain to the limit list once its daily limit is reached', async () => {
    await updateSettings({ scrollstop: { limits: [{ id: 'l', domain: 'youtube.com', minutes: 1, enabled: true }] } });
    await usageRepo.add(dayKey(), 'm.youtube.com', 50);
    await refreshTracking();
    advance(5);
    await flushTracking();
    expect((await getLimitState()).domains).toEqual([]);
    advance(10);
    await flushTracking();
    expect((await getLimitState()).domains).toEqual(['youtube.com']);
  });
});
