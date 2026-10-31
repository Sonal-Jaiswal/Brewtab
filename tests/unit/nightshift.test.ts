import { describe, expect, it } from 'vitest';
import { buildCss, isScheduleWindow, luminance, msUntilScheduleChange, NEUTRAL_PREFS, resolvePrefs } from '@/modules/nightshift/engine';
import { DEFAULT_SETTINGS } from '@/storage/chrome-storage/settings';
import type { NightShiftSettings } from '@/shared/types';

const ns = (over: Partial<NightShiftSettings> = {}): NightShiftSettings => ({ ...structuredClone(DEFAULT_SETTINGS.nightshift), ...over });
const now = new Date(2026, 9, 31, 21, 0);

describe('NightShift resolution', () => {
  it('does nothing when the module or quick toggle is off', () => {
    expect(resolvePrefs(ns({ active: true }), false, 'a.com', now).reason).toBe('module-off');
    expect(resolvePrefs(ns(), true, 'a.com', now).reason).toBe('inactive');
  });

  it('applies global prefs when enabled', () => {
    const r = resolvePrefs(ns({ active: true }), true, 'a.com', now);
    expect(r.reason).toBe('applied');
    expect(r.prefs?.dark).toBe(true);
  });

  it('per-site overrides win and apply even when globally inactive', () => {
    const s = ns({ sites: { 'news.com': { prefs: { dark: false, fontScale: 120 } } } });
    const r = resolvePrefs(s, true, 'www.news.com'.replace('www.', ''), now);
    expect(r.prefs).toMatchObject({ dark: false, fontScale: 120 });
    expect(resolvePrefs(s, true, 'sub.news.com', now).reason).toBe('applied');
  });

  it('respects exclusions and per-site disable', () => {
    expect(resolvePrefs(ns({ active: true, excluded: ['bank.com'] }), true, 'login.bank.com', now).reason).toBe('excluded');
    expect(resolvePrefs(ns({ active: true, sites: { 'x.com': { disabled: true } } }), true, 'x.com', now).reason).toBe('site-disabled');
  });

  it('only applies inside the schedule window', () => {
    const schedule = { enabled: true, start: '19:00', end: '07:00' };
    expect(isScheduleWindow(schedule, new Date(2026, 9, 31, 21, 0))).toBe(true);
    expect(isScheduleWindow(schedule, new Date(2026, 9, 31, 6, 59))).toBe(true);
    expect(isScheduleWindow(schedule, new Date(2026, 9, 31, 12, 0))).toBe(false);
    expect(resolvePrefs(ns({ active: true, schedule }), true, 'a.com', new Date(2026, 9, 31, 12, 0)).reason).toBe('outside-schedule');
    expect(msUntilScheduleChange(schedule, new Date(2026, 9, 31, 18, 30, 0))).toBe(30 * 60_000);
  });
});

describe('NightShift CSS', () => {
  it('is empty for neutral prefs (no page modification)', () => {
    expect(buildCss(NEUTRAL_PREFS)).toBe('');
  });

  it('inverts the page and re-inverts media in dark mode', () => {
    const css = buildCss({ ...NEUTRAL_PREFS, dark: true });
    expect(css).toContain('invert(1) hue-rotate(180deg)');
    expect(css).toMatch(/img, video.*invert\(1\)/);
  });

  it('skips inversion on pages that are already dark but keeps other adjustments', () => {
    const css = buildCss({ ...NEUTRAL_PREFS, dark: true, brightness: 90 }, { pageIsDark: true });
    expect(css).not.toContain('invert');
    expect(css).toContain('brightness(0.9)');
  });

  it('adds typography rules without touching code or icon fonts', () => {
    const css = buildCss({ ...NEUTRAL_PREFS, fontFamily: 'serif', fontScale: 120 });
    expect(css).toContain('font-size: 120%');
    expect(css).toContain(':not(code)');
    expect(css).toContain('Georgia');
  });

  it('computes luminance for dark-page detection', () => {
    expect(luminance('rgb(0, 0, 0)')).toBe(0);
    expect(luminance('rgb(255, 255, 255)')).toBeCloseTo(1);
    expect(luminance('rgba(0, 0, 0, 0)')).toBeNull();
  });
});
