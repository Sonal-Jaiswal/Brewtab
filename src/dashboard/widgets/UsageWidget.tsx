import { useState } from 'react';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { usageRepo } from '@/storage/indexeddb/repos';
import { useLiveQuery, useNow, usePermission } from '@/shared/hooks';
import { SITE_ACCESS, requestPermission } from '@/shared/permissions';
import { dailyTotals, topSites, totalSeconds } from '@/modules/scrollstop/usage';
import { addDays, dayKey, formatDuration } from '@/shared/utils';
import { Button, EmptyState, Segmented } from '@/shared/components/ui';
import { WIDGETS, widgetSetting, type WidgetProps } from './registry';

export default function UsageWidget({ instance, settings }: WidgetProps) {
  const [granted] = usePermission(SITE_ACCESS);
  const [range, setRange] = useState<'today' | 'week'>('today');
  const now = useNow(60_000);
  const today = dayKey(now);
  const from = dayKey(addDays(now, -6));
  const { data: records = [] } = useLiveQuery(() => usageRepo.forRange(from, today), ['usage'], [from, today]);
  const count = widgetSetting<number>(instance, WIDGETS.usage, 'count');

  if (granted === false && !__BREWTAB_E2E__) {
    return (
      <EmptyState icon={ShieldCheck} title="Screen time is off" action={<Button size="sm" variant="primary" onClick={() => void requestPermission(SITE_ACCESS)}>Allow site access</Button>}>
        To count time per website, Brewtab needs to read the address of your active tab. It stays on this device.
      </EmptyState>
    );
  }
  if (!settings.scrollstop.trackUsage) {
    return <EmptyState icon={BarChart3} title="Usage tracking is paused">Turn it on in Settings → ScrollStop.</EmptyState>;
  }

  const scoped = range === 'today' ? records.filter((r) => r.date === today) : records;
  const sites = topSites(scoped, count);
  const total = totalSeconds(scoped);
  const max = sites[0]?.seconds ?? 1;
  const week = dailyTotals(records, now, 7);
  const weekMax = Math.max(1, ...week.map((d) => d.seconds));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="bt-tabular font-display text-2xl leading-none">{formatDuration(total)}</div>
          <div className="mt-1 text-[11.5px] text-muted">{range === 'today' ? 'today' : 'last 7 days'} in the browser</div>
        </div>
        <Segmented label="Range" value={range} onChange={setRange} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'Week' }]} />
      </div>
      {range === 'week' && (
        <div className="mb-3 flex h-14 items-end gap-1.5" role="img" aria-label="Daily browsing time this week">
          {week.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${formatDuration(d.seconds)}`}>
              <div className="w-full rounded-t-[4px] bg-accent/70" style={{ height: `${Math.max(3, (d.seconds / weekMax) * 40)}px`, opacity: d.date === today ? 1 : 0.55 }} />
              <span className="text-[10px] text-muted">{new Date(`${d.date}T00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {sites.map((s) => (
          <li key={s.domain} className="text-[12.5px]">
            <div className="flex justify-between gap-2">
              <span className="truncate">{s.domain}</span>
              <span className="bt-tabular shrink-0 text-muted">{formatDuration(s.seconds)}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-subtle">
              <div className="h-1 rounded-full bg-accent" style={{ width: `${(s.seconds / max) * 100}%` }} />
            </div>
          </li>
        ))}
        {sites.length === 0 && <EmptyState icon={BarChart3} title="No browsing time yet">Time appears here as you browse. Idle time isn’t counted.</EmptyState>}
      </ul>
    </div>
  );
}
