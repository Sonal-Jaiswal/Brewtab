// Scheduled blocking windows. Windows may cross midnight (e.g. 22:00–06:00);
// the part after midnight belongs to the day the window *started*.
import type { Schedule } from '@/shared/types';
import { parseHm } from '@/shared/utils';

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function isValidSchedule(s: Schedule): boolean {
  const start = parseHm(s.start);
  const end = parseHm(s.end);
  return Number.isFinite(start) && Number.isFinite(end) && start !== end && s.days.length > 0;
}

export function isScheduleActive(s: Schedule, now: Date): boolean {
  if (!s.enabled || !isValidSchedule(s)) return false;
  const start = parseHm(s.start);
  const end = parseHm(s.end);
  const m = minutesOfDay(now);
  const day = now.getDay();
  if (start < end) return s.days.includes(day) && m >= start && m < end;
  // Overnight window.
  const yesterday = (day + 6) % 7;
  return (s.days.includes(day) && m >= start) || (s.days.includes(yesterday) && m < end);
}

export function activeSchedules(schedules: Schedule[], now: Date): Schedule[] {
  return schedules.filter((s) => isScheduleActive(s, now));
}

/**
 * The next instant (ms) at which any schedule starts or ends, strictly after `now`.
 * Used to set a single chrome.alarms alarm instead of polling.
 */
export function nextScheduleBoundary(schedules: Schedule[], now: Date): number | null {
  let best: number | null = null;
  for (const s of schedules) {
    if (!s.enabled || !isValidSchedule(s)) continue;
    const start = parseHm(s.start);
    const end = parseHm(s.end);
    for (let offset = -1; offset <= 7; offset++) {
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      if (!s.days.includes(base.getDay())) continue;
      const startAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, start).getTime();
      const endDayOffset = end <= start ? 1 : 0;
      const endAt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + endDayOffset, 0, end).getTime();
      for (const t of [startAt, endAt]) {
        if (t > now.getTime() && (best === null || t < best)) best = t;
      }
    }
  }
  return best;
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSchedule(s: Schedule): string {
  const days = [...s.days].sort();
  let dayText: string;
  if (days.length === 7) dayText = 'Every day';
  else if (days.join() === '1,2,3,4,5') dayText = 'Weekdays';
  else if (days.join() === '0,6') dayText = 'Weekends';
  else dayText = days.map((d) => DAY_LABELS[d]).join(', ');
  return `${dayText} · ${s.start}–${s.end}${parseHm(s.end) <= parseHm(s.start) ? ' (next day)' : ''}`;
}
