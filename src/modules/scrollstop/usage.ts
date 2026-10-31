// Usage aggregation helpers. Tracking itself lives in the service worker.
import type { DailyLimit, UsageRecord } from '@/shared/types';
import { addDays, dayKey } from '@/shared/utils';
import { hostMatchesDomain } from '@/shared/utils/url';

/** A tracking segment is never credited more than this (guards against sleep/suspension gaps). */
export const MAX_SEGMENT_SECONDS = 120;

/** Split a [start, end) interval into per-day second counts, clamping the total. */
export function splitByDay(startMs: number, endMs: number, maxSeconds = MAX_SEGMENT_SECONDS): { date: string; seconds: number }[] {
  if (!(endMs > startMs)) return [];
  const clampedEnd = Math.min(endMs, startMs + maxSeconds * 1000);
  const out: { date: string; seconds: number }[] = [];
  let cursor = startMs;
  while (cursor < clampedEnd) {
    const d = new Date(cursor);
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const stop = Math.min(nextMidnight, clampedEnd);
    out.push({ date: dayKey(d), seconds: (stop - cursor) / 1000 });
    cursor = stop;
  }
  return out;
}

export interface SiteTotal {
  domain: string;
  seconds: number;
}

export function topSites(records: UsageRecord[], limit = 10): SiteTotal[] {
  const map = new Map<string, number>();
  for (const r of records) map.set(r.domain, (map.get(r.domain) ?? 0) + r.seconds);
  return [...map.entries()]
    .map(([domain, seconds]) => ({ domain, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
}

export function totalSeconds(records: UsageRecord[]): number {
  return records.reduce((sum, r) => sum + r.seconds, 0);
}

/** Totals for each of the last `days` days ending at `end` (oldest first). */
export function dailyTotals(records: UsageRecord[], end: Date, days = 7): { date: string; seconds: number }[] {
  const byDate = new Map<string, number>();
  for (const r of records) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.seconds);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(addDays(end, -i));
    out.push({ date, seconds: byDate.get(date) ?? 0 });
  }
  return out;
}

/** Seconds spent today on a limit's domain, including subdomains. */
export function secondsForDomain(records: UsageRecord[], domain: string): number {
  return records.filter((r) => hostMatchesDomain(r.domain, domain)).reduce((s, r) => s + r.seconds, 0);
}

export function exceededLimits(limits: DailyLimit[], todayRecords: UsageRecord[]): string[] {
  return limits.filter((l) => l.enabled && l.minutes > 0 && secondsForDomain(todayRecords, l.domain) >= l.minutes * 60).map((l) => l.domain);
}
