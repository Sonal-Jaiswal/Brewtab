import { describe, expect, it } from 'vitest';
import { buildRules, isUrlBlockedBy, patternToRegex, validateRuleInput, type RuleContext } from '@/modules/scrollstop/rules';
import { isScheduleActive, nextScheduleBoundary } from '@/modules/scrollstop/schedule';
import { advanceFocus, endFocus, pauseFocus, remainingMs, resumeFocus, startFocus, isFocusBlocking } from '@/modules/scrollstop/focus';
import { dailyTotals, exceededLimits, splitByDay, topSites } from '@/modules/scrollstop/usage';
import { DEFAULT_SETTINGS } from '@/storage/chrome-storage/settings';
import type { BlockRule, Schedule, ScrollStopSettings, UsageRecord } from '@/shared/types';

const rule = (value: string, kind: BlockRule['kind'] = 'domain', enabled = true): BlockRule => ({ id: value, kind, value, enabled, createdAt: 0 });

const base = (): ScrollStopSettings => structuredClone(DEFAULT_SETTINGS.scrollstop);
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  moduleEnabled: true,
  focusActive: false,
  scheduleActive: false,
  limitDomains: [],
  canRedirect: true,
  blockedPageUrl: 'chrome-extension://id/blocked.html',
  ...over,
});

describe('block rules', () => {
  it('adds no rules when nothing is active', () => {
    const s = base();
    s.blocklist = [rule('youtube.com')];
    expect(buildRules(s, ctx())).toEqual([]);
  });

  it('blocks domains and subdomains during focus', () => {
    const s = base();
    s.blocklist = [rule('youtube.com'), rule('x.com', 'domain', false)];
    const rules = buildRules(s, ctx({ focusActive: true }));
    expect(rules).toHaveLength(1);
    expect(isUrlBlockedBy(rules, 'https://www.youtube.com/watch?v=1')).not.toBeNull();
    expect(isUrlBlockedBy(rules, 'https://m.youtube.com/')).not.toBeNull();
    expect(isUrlBlockedBy(rules, 'https://notyoutube.com/')).toBeNull();
    expect(isUrlBlockedBy(rules, 'https://x.com/')).toBeNull();
    expect(rules[0].action.redirect?.regexSubstitution).toContain('reason=focus');
  });

  it('falls back to a plain block without host access', () => {
    const s = base();
    s.alwaysOn = true;
    s.blocklist = [rule('reddit.com')];
    const [r] = buildRules(s, ctx({ canRedirect: false }));
    expect(r.action.type).toBe('block');
  });

  it('removing a rule removes it from the rule set', () => {
    const s = base();
    s.alwaysOn = true;
    s.blocklist = [rule('a.com'), rule('b.com')];
    expect(buildRules(s, ctx())).toHaveLength(2);
    s.blocklist = s.blocklist.filter((r) => r.value !== 'a.com');
    const rules = buildRules(s, ctx());
    expect(rules).toHaveLength(1);
    expect(isUrlBlockedBy(rules, 'https://a.com')).toBeNull();
  });

  it('respects the allowlist with higher priority', () => {
    const s = base();
    s.alwaysOn = true;
    s.blocklist = [rule('google.com')];
    s.allowlist = [rule('docs.google.com')];
    const rules = buildRules(s, ctx());
    expect(isUrlBlockedBy(rules, 'https://news.google.com')).not.toBeNull();
    expect(isUrlBlockedBy(rules, 'https://docs.google.com/document/d/1')).toBeNull();
  });

  it('supports URL pattern rules', () => {
    const s = base();
    s.alwaysOn = true;
    s.blocklist = [rule('youtube.com/shorts/*', 'pattern'), rule('reddit.com/r/*/comments', 'pattern')];
    const rules = buildRules(s, ctx());
    expect(isUrlBlockedBy(rules, 'https://www.youtube.com/shorts/abc')).not.toBeNull();
    expect(isUrlBlockedBy(rules, 'https://www.youtube.com/watch?v=1')).toBeNull();
    expect(isUrlBlockedBy(rules, 'https://old.reddit.com/r/foo/comments/1')).not.toBeNull();
    expect(isUrlBlockedBy(rules, 'https://reddit.com/r/foo')).toBeNull();
  });

  it('pattern without a path matches the whole host only', () => {
    const re = new RegExp(patternToRegex('example.com')!);
    expect(re.test('https://example.com/a')).toBe(true);
    expect(re.test('https://example.com.evil.net/')).toBe(false);
  });

  it('blocks domains over their daily limit even outside focus', () => {
    const rules = buildRules(base(), ctx({ limitDomains: ['tiktok.com'] }));
    expect(rules[0].action.redirect?.regexSubstitution).toContain('reason=limit');
  });

  it('produces no rules when the module is disabled', () => {
    const s = base();
    s.alwaysOn = true;
    s.blocklist = [rule('a.com')];
    expect(buildRules(s, ctx({ moduleEnabled: false, limitDomains: ['b.com'] }))).toEqual([]);
  });

  it('validates user input', () => {
    expect(validateRuleInput('domain', 'https://www.Example.com/path')).toBe('example.com');
    expect(validateRuleInput('domain', 'not a domain')).toBeNull();
    expect(validateRuleInput('pattern', 'https://example.com/a/*')).toBe('example.com/a/*');
    expect(validateRuleInput('pattern', '???')).toBeNull();
  });
});

describe('schedules', () => {
  const weekdays: Schedule = { id: 's', name: 'Work', enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
  const night: Schedule = { id: 'n', name: 'Night', enabled: true, days: [5], start: '22:00', end: '06:00' };

  it('is active inside the window on selected days only', () => {
    expect(isScheduleActive(weekdays, new Date(2026, 10, 2, 10, 0))).toBe(true); // Mon
    expect(isScheduleActive(weekdays, new Date(2026, 10, 2, 17, 0))).toBe(false);
    expect(isScheduleActive(weekdays, new Date(2026, 10, 1, 10, 0))).toBe(false); // Sun
    expect(isScheduleActive({ ...weekdays, enabled: false }, new Date(2026, 10, 2, 10, 0))).toBe(false);
  });

  it('handles windows that cross midnight', () => {
    expect(isScheduleActive(night, new Date(2026, 9, 30, 23, 0))).toBe(true); // Fri 23:00
    expect(isScheduleActive(night, new Date(2026, 9, 31, 5, 59))).toBe(true); // Sat 05:59
    expect(isScheduleActive(night, new Date(2026, 9, 31, 6, 0))).toBe(false);
    expect(isScheduleActive(night, new Date(2026, 9, 31, 23, 0))).toBe(false); // Sat night
  });

  it('computes the next boundary for alarms', () => {
    const now = new Date(2026, 10, 2, 8, 30); // Mon 08:30
    expect(nextScheduleBoundary([weekdays], now)).toBe(new Date(2026, 10, 2, 9, 0).getTime());
    const during = new Date(2026, 10, 2, 12, 0);
    expect(nextScheduleBoundary([weekdays], during)).toBe(new Date(2026, 10, 2, 17, 0).getTime());
    const friEvening = new Date(2026, 10, 6, 18, 0); // Fri after work → Mon 09:00
    expect(nextScheduleBoundary([weekdays], friEvening)).toBe(new Date(2026, 10, 9, 9, 0).getTime());
    expect(nextScheduleBoundary([night], new Date(2026, 9, 30, 23, 0))).toBe(new Date(2026, 9, 31, 6, 0).getTime());
    expect(nextScheduleBoundary([], now)).toBeNull();
  });
});

describe('focus timer', () => {
  const config = { workMinutes: 25, breakMinutes: 5, cycles: 2, blockDuringFocus: true, autoStartBreaks: true };

  it('runs work → break → work → done and records focus time', () => {
    let s = startFocus(config, 0);
    expect(isFocusBlocking(s)).toBe(true);
    let r = advanceFocus(s, config, 25 * 60_000);
    expect(r.event).toBe('break-started');
    s = r.state;
    expect(isFocusBlocking(s)).toBe(false);
    r = advanceFocus(s, config, 30 * 60_000);
    expect(r.event).toBe('work-started');
    r = advanceFocus(r.state, config, 55 * 60_000);
    expect(r.event).toBe('completed');
    expect(r.state.status).toBe('idle');
    expect(r.record).toMatchObject({ focusedMs: 50 * 60_000, completed: true, cyclesCompleted: 2 });
  });

  it('pauses and resumes without losing time', () => {
    let s = startFocus(config, 0);
    s = pauseFocus(s, 10 * 60_000);
    expect(remainingMs(s, 99 * 60_000)).toBe(15 * 60_000);
    s = resumeFocus(s, 20 * 60_000);
    expect(remainingMs(s, 20 * 60_000)).toBe(15 * 60_000);
    expect(advanceFocus(s, config, 30 * 60_000).event).toBe('none');
    expect(advanceFocus(s, config, 35 * 60_000).event).toBe('break-started');
  });

  it('ending early records the partial focus time', () => {
    const s = pauseFocus(startFocus(config, 0), 10 * 60_000);
    const r = endFocus(s, 50 * 60_000);
    expect(r.record).toMatchObject({ focusedMs: 10 * 60_000, completed: false });
  });

  it('recovers when the service worker slept through several phases', () => {
    const s = startFocus(config, 0);
    const r = advanceFocus(s, config, 60 * 60_000);
    expect(r.event).toBe('completed');
    expect(r.record?.focusedMs).toBe(50 * 60_000);
  });

  it('single custom-length sessions have one cycle', () => {
    const s = startFocus(config, 0, 10);
    const r = advanceFocus(s, config, 10 * 60_000);
    expect(r.event).toBe('completed');
  });
});

describe('usage calculations', () => {
  it('splits segments across midnight', () => {
    const start = new Date(2026, 9, 30, 23, 59, 30).getTime();
    expect(splitByDay(start, start + 60_000)).toEqual([
      { date: '2026-10-30', seconds: 30 },
      { date: '2026-10-31', seconds: 30 },
    ]);
  });

  it('clamps long gaps such as sleep or suspension', () => {
    const parts = splitByDay(0, 3_600_000);
    expect(parts.reduce((s, p) => s + p.seconds, 0)).toBe(120);
    expect(splitByDay(10, 5)).toEqual([]);
  });

  const recs: UsageRecord[] = [
    { key: '1', date: '2026-10-31', domain: 'youtube.com', seconds: 1800 },
    { key: '2', date: '2026-10-31', domain: 'm.youtube.com', seconds: 600 },
    { key: '3', date: '2026-10-31', domain: 'github.com', seconds: 900 },
    { key: '4', date: '2026-10-29', domain: 'github.com', seconds: 100 },
  ];

  it('ranks top sites and totals by day', () => {
    expect(topSites(recs, 2).map((s) => s.domain)).toEqual(['youtube.com', 'github.com']);
    const totals = dailyTotals(recs, new Date(2026, 9, 31), 3);
    expect(totals).toEqual([
      { date: '2026-10-29', seconds: 100 },
      { date: '2026-10-30', seconds: 0 },
      { date: '2026-10-31', seconds: 3300 },
    ]);
  });

  it('detects exceeded daily limits including subdomains', () => {
    const today = recs.filter((r) => r.date === '2026-10-31');
    const limits = [
      { id: 'a', domain: 'youtube.com', minutes: 40, enabled: true },
      { id: 'b', domain: 'github.com', minutes: 60, enabled: true },
      { id: 'c', domain: 'youtube.com', minutes: 1, enabled: false },
    ];
    expect(exceededLimits(limits, today)).toEqual(['youtube.com']);
  });
});
