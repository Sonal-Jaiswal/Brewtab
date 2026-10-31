import { useState, type FormEvent } from 'react';
import { CalendarClock, Hourglass, Plus, Trash2, Pencil, BarChart3 } from 'lucide-react';
import type { BlockRule, DailyLimit, Schedule, Settings } from '@/shared/types';
import { validateRuleInput } from '@/modules/scrollstop/rules';
import { DAY_LABELS, describeSchedule, isScheduleActive, isValidSchedule } from '@/modules/scrollstop/schedule';
import { dailyTotals, secondsForDomain, topSites, totalSeconds } from '@/modules/scrollstop/usage';
import { focusRepo, usageRepo } from '@/storage/indexeddb/repos';
import { SITE_ACCESS, requestPermission } from '@/shared/permissions';
import { useLiveQuery, usePermission } from '@/shared/hooks';
import { addDays, dayKey, formatDuration, uid } from '@/shared/utils';
import { normalizeDomain } from '@/shared/utils/url';
import { Badge, Button, EmptyState, Field, IconButton, Input, Segmented, SettingRow, Toggle, cx } from '@/shared/components/ui';
import { Modal, useConfirm, useToast } from '@/shared/components/overlay';
import { DebouncedInput, Page, Panel, type SectionProps } from '../App';

export default function ScrollStop({ settings, update }: SectionProps) {
  const ss = settings.scrollstop;
  const [siteAccess] = usePermission(SITE_ACCESS);
  const enabled = settings.modules.scrollstop;

  return (
    <Page title="ScrollStop" description="Block distracting sites always, on a schedule, or while you focus, and see where your browsing time goes.">
      <Panel>
        <SettingRow title="Turn on ScrollStop" description={enabled ? 'Blocking, focus sessions and screen time are active.' : 'ScrollStop is turned off. Nothing is blocked or tracked.'}>
          <Toggle label="Enable ScrollStop" checked={enabled} onChange={(v) => void update({ modules: { scrollstop: v } })} />
        </SettingRow>
      </Panel>

      <Panel title="Blocking">
        <SettingRow title="Block all the time" description="When off, sites are blocked only during focus sessions and schedules.">
          <Toggle label="Always block" checked={ss.alwaysOn} onChange={(v) => void update({ scrollstop: { alwaysOn: v } })} />
        </SettingRow>
        <SettingRow title="Blocked page message">
          <DebouncedInput className="!w-80" value={ss.blockedMessage} maxLength={160} onCommit={(v) => void update({ scrollstop: { blockedMessage: v } })} aria-label="Blocked page message" />
        </SettingRow>
        {!siteAccess && (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-ctl bg-subtle p-3 text-[13px]">
            <span className="text-muted">Without site access, blocked sites show Chrome’s standard error page instead of Brewtab’s friendly blocked page.</span>
            <Button size="sm" onClick={() => void requestPermission(SITE_ACCESS)}>
              Allow site access
            </Button>
          </div>
        )}
      </Panel>

      <RuleList
        title="Blocklist"
        description="Domains include their subdomains. URL patterns can target part of a site, e.g. youtube.com/shorts/*."
        rules={ss.blocklist}
        onChange={(rules) => void update((s) => void (s.scrollstop.blocklist = rules))}
        empty="No blocked sites yet."
      />
      <RuleList
        title="Allowlist"
        description="Always allowed, even when a broader rule would block them (e.g. allow docs.google.com while blocking google.com)."
        rules={ss.allowlist}
        onChange={(rules) => void update((s) => void (s.scrollstop.allowlist = rules))}
        empty="Nothing on the allowlist."
      />
      <Schedules settings={settings} update={update} />
      <Limits settings={settings} update={update} siteAccess={!!siteAccess || __BREWTAB_E2E__} />
      <FocusSettings settings={settings} update={update} />

      <Panel title="Screen time">
        <SettingRow title="Track time per website" description="Counts time on the active tab while you’re not idle. Stored as daily totals per domain, kept for 90 days.">
          <Toggle label="Track usage" checked={ss.trackUsage} onChange={(v) => void update({ scrollstop: { trackUsage: v } })} />
        </SettingRow>
        {!siteAccess && !__BREWTAB_E2E__ && (
          <p className="pt-2 text-[13px] text-muted">
            Tracking needs site access to read the active tab’s address.{' '}
            <button className="font-medium text-accent hover:underline" onClick={() => void requestPermission(SITE_ACCESS)}>
              Allow site access
            </button>
          </p>
        )}
        <p className="pt-2 text-[12.5px] text-muted">
          Time isn’t counted while Chrome is closed, the computer sleeps or you’re idle for over a minute, so totals are a close estimate rather than exact.
        </p>
      </Panel>

      <Reports />
    </Page>
  );
}

function RuleList({ title, description, rules, onChange, empty }: { title: string; description: string; rules: BlockRule[]; onChange: (r: BlockRule[]) => void; empty: string }) {
  const [kind, setKind] = useState<BlockRule['kind']>('domain');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add(e: FormEvent) {
    e.preventDefault();
    const normalized = validateRuleInput(kind, value);
    if (!normalized) return setError(kind === 'domain' ? 'Enter a domain like example.com' : 'Enter a pattern like example.com/path/*');
    if (rules.some((r) => r.kind === kind && r.value === normalized)) return setError('Already on the list');
    onChange([...rules, { id: uid('r_'), kind, value: normalized, enabled: true, createdAt: Date.now() }]);
    setValue('');
    setError(null);
  }

  return (
    <Panel title={title} description={description}>
      <form onSubmit={add} className="mt-2 flex flex-wrap items-start gap-2">
        <Segmented
          label="Rule type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'domain', label: 'Domain' },
            { value: 'pattern', label: 'URL pattern' },
          ]}
        />
        <div className="min-w-56 flex-1">
          <Input value={value} onChange={(e) => (setValue(e.target.value), setError(null))} placeholder={kind === 'domain' ? 'example.com' : 'example.com/feed/*'} aria-label={`Add to ${title}`} aria-invalid={!!error} />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
        <Button type="submit" variant="primary" icon={Plus}>
          Add
        </Button>
      </form>
      <ul className="mt-3 divide-y divide-line" aria-label={title}>
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <Toggle label={`Enable ${r.value}`} checked={r.enabled} onChange={(v) => onChange(rules.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))} />
            <span className={cx('flex-1 truncate text-sm', !r.enabled && 'text-muted line-through')}>{r.value}</span>
            <Badge>{r.kind === 'domain' ? 'Domain' : 'Pattern'}</Badge>
            <IconButton icon={Trash2} label={`Remove ${r.value}`} size="sm" onClick={() => onChange(rules.filter((x) => x.id !== r.id))} />
          </li>
        ))}
        {rules.length === 0 && <li className="py-3 text-[13px] text-muted">{empty}</li>}
      </ul>
    </Panel>
  );
}

function Schedules({ settings, update }: SectionProps) {
  const [editing, setEditing] = useState<Schedule | null>(null);
  const list = settings.scrollstop.schedules;
  const now = new Date();
  const save = (s: Schedule) =>
    void update((st) => {
      const i = st.scrollstop.schedules.findIndex((x) => x.id === s.id);
      if (i >= 0) st.scrollstop.schedules[i] = s;
      else st.scrollstop.schedules.push(s);
    });

  return (
    <Panel
      title="Schedules"
      description="Block your blocklist automatically at set times. Windows can cross midnight."
      actions={
        <Button size="sm" icon={Plus} onClick={() => setEditing({ id: uid('s_'), name: 'Work hours', enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' })}>
          Add schedule
        </Button>
      }
    >
      <ul className="divide-y divide-line">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <Toggle label={`Enable ${s.name}`} checked={s.enabled} onChange={(v) => save({ ...s, enabled: v })} />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {s.name} {isScheduleActive(s, now) && <Badge tone="accent">Active now</Badge>}
              </div>
              <div className="text-[12.5px] text-muted">{describeSchedule(s)}</div>
            </div>
            <IconButton icon={Pencil} label={`Edit ${s.name}`} size="sm" onClick={() => setEditing(s)} />
            <IconButton icon={Trash2} label={`Delete ${s.name}`} size="sm" onClick={() => void update((st) => void (st.scrollstop.schedules = st.scrollstop.schedules.filter((x) => x.id !== s.id)))} />
          </li>
        ))}
        {list.length === 0 && (
          <li>
            <EmptyState icon={CalendarClock} title="No schedules">
              For example, block social media on weekdays from 9:00 to 17:00.
            </EmptyState>
          </li>
        )}
      </ul>
      <ScheduleEditor schedule={editing} onClose={() => setEditing(null)} onSave={(s) => (save(s), setEditing(null))} />
    </Panel>
  );
}

function ScheduleEditor({ schedule, onClose, onSave }: { schedule: Schedule | null; onClose: () => void; onSave: (s: Schedule) => void }) {
  const [draft, setDraft] = useState<Schedule | null>(schedule);
  // Start from the saved schedule every time the editor opens, so cancelled edits don't come back.
  const [opened, setOpened] = useState<Schedule | null>(schedule);
  if (schedule !== opened) {
    setOpened(schedule);
    setDraft(schedule);
  }
  if (!schedule || !draft) return null;
  const valid = isValidSchedule(draft) && draft.name.trim();
  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
            Save schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input data-autofocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium">Days</span>
          <div className="flex gap-1.5" role="group" aria-label="Days">
            {DAY_LABELS.map((d, i) => {
              const on = draft.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== i) : [...draft.days, i].sort() })}
                  className={cx('h-9 w-11 rounded-ctl border text-[13px] font-medium', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-subtle')}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <Input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </Field>
          <Field label="End" hint={draft.end <= draft.start ? 'Ends the next day.' : undefined}>
            <Input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </Field>
        </div>
        {!isValidSchedule(draft) && <p className="text-[13px] text-danger">Pick at least one day, and different start and end times.</p>}
      </div>
    </Modal>
  );
}

function Limits({ settings, update, siteAccess }: SectionProps & { siteAccess: boolean }) {
  const [domain, setDomain] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const { data: today = [] } = useLiveQuery(() => usageRepo.forDate(dayKey()), ['usage']);
  const limits = settings.scrollstop.limits;
  const setLimits = (l: DailyLimit[]) => void update((s) => void (s.scrollstop.limits = l));

  function add(e: FormEvent) {
    e.preventDefault();
    const d = normalizeDomain(domain);
    if (!d) return setError('Enter a domain like youtube.com');
    if (limits.some((l) => l.domain === d)) return setError('There’s already a limit for this site');
    setLimits([...limits, { id: uid('l_'), domain: d, minutes: Math.max(1, Math.min(1440, minutes)), enabled: true }]);
    setDomain('');
    setError(null);
  }

  return (
    <Panel title="Daily limits" description="Once you reach a site’s daily limit it’s blocked until midnight. Requires screen-time tracking.">
      {!siteAccess && <p className="mb-2 text-[13px] text-muted">Limits need site access so Brewtab can measure time per site.</p>}
      <form onSubmit={add} className="flex flex-wrap items-start gap-2">
        <div className="min-w-48 flex-1">
          <Input value={domain} onChange={(e) => (setDomain(e.target.value), setError(null))} placeholder="youtube.com" aria-label="Site to limit" />
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="!w-20" aria-label="Minutes per day" />
          <span className="text-sm text-muted">min/day</span>
        </div>
        <Button type="submit" variant="primary" icon={Plus}>
          Add limit
        </Button>
      </form>
      <ul className="mt-3 divide-y divide-line">
        {limits.map((l) => {
          const used = secondsForDomain(today, l.domain);
          const pct = Math.min(100, (used / (l.minutes * 60)) * 100);
          return (
            <li key={l.id} className="flex items-center gap-3 py-2.5">
              <Toggle label={`Enable limit for ${l.domain}`} checked={l.enabled} onChange={(v) => setLimits(limits.map((x) => (x.id === l.id ? { ...x, enabled: v } : x)))} />
              <div className="flex-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{l.domain}</span>
                  <span className="bt-tabular text-muted">
                    {formatDuration(used)} / {l.minutes}m
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-subtle">
                  <div className={cx('h-1.5 rounded-full', pct >= 100 ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <IconButton icon={Trash2} label={`Remove limit for ${l.domain}`} size="sm" onClick={() => setLimits(limits.filter((x) => x.id !== l.id))} />
            </li>
          );
        })}
        {limits.length === 0 && (
          <li>
            <EmptyState icon={Hourglass} title="No limits set" />
          </li>
        )}
      </ul>
    </Panel>
  );
}

function FocusSettings({ settings, update }: SectionProps) {
  const f = settings.scrollstop.focus;
  const set = (patch: Partial<Settings['scrollstop']['focus']>) => void update({ scrollstop: { focus: patch } });
  const num = (label: string, value: number, key: 'workMinutes' | 'breakMinutes' | 'cycles', min: number, max: number) => (
    <SettingRow title={label}>
      <Input type="number" className="!w-24" min={min} max={max} value={value} aria-label={label} onChange={(e) => set({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })} />
    </SettingRow>
  );
  return (
    <Panel title="Focus sessions" description="Work and break cycles. Start them from the dashboard, the popup or the Focus widget.">
      {num('Focus length (minutes)', f.workMinutes, 'workMinutes', 1, 240)}
      {num('Break length (minutes)', f.breakMinutes, 'breakMinutes', 1, 120)}
      {num('Cycles per session', f.cycles, 'cycles', 1, 12)}
      <SettingRow title="Block your blocklist while focusing">
        <Toggle label="Block during focus" checked={f.blockDuringFocus} onChange={(v) => set({ blockDuringFocus: v })} />
      </SettingRow>
      <SettingRow title="Start breaks automatically" description="When off, the timer pauses at each break until you resume.">
        <Toggle label="Auto-start breaks" checked={f.autoStartBreaks} onChange={(v) => set({ autoStartBreaks: v })} />
      </SettingRow>
    </Panel>
  );
}

function Reports() {
  const confirm = useConfirm();
  const toast = useToast();
  const now = new Date();
  const from = dayKey(addDays(now, -6));
  const { data: records = [] } = useLiveQuery(() => usageRepo.forRange(from, dayKey(now)), ['usage']);
  const { data: history = [] } = useLiveQuery(() => focusRepo.recent(30), ['focusSessions']);
  const week = dailyTotals(records, now, 7);
  const max = Math.max(1, ...week.map((d) => d.seconds));
  const sites = topSites(records, 8);
  const weekFocus = history.filter((h) => h.startedAt >= addDays(now, -6).setHours(0, 0, 0, 0)).reduce((s, h) => s + h.focusedMs, 0);

  return (
    <Panel title="Reports" description="Last 7 days. Everything here is computed on this device.">
      <div className="grid gap-6 pt-2 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold text-muted">Browsing time</h3>
            <span className="bt-tabular text-sm">{formatDuration(totalSeconds(records))} total</span>
          </div>
          <div className="flex h-36 items-end gap-2" role="img" aria-label="Browsing time per day for the last 7 days">
            {week.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="bt-tabular text-[10.5px] text-muted">{d.seconds ? formatDuration(d.seconds) : ''}</span>
                <div className="w-full rounded-t-md bg-accent" style={{ height: `${Math.max(2, (d.seconds / max) * 96)}px`, opacity: d.date === dayKey(now) ? 1 : 0.55 }} />
                <span className="text-[11px] text-muted">{new Date(`${d.date}T00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-[13px] font-semibold text-muted">Most visited</h3>
          {sites.length ? (
            <ol className="space-y-1.5 text-[13px]">
              {sites.map((s, i) => (
                <li key={s.domain} className="flex justify-between gap-3">
                  <span className="truncate">
                    <span className="mr-2 text-muted">{i + 1}</span>
                    {s.domain}
                  </span>
                  <span className="bt-tabular text-muted">{formatDuration(s.seconds)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={BarChart3} title="No usage recorded yet" />
          )}
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-muted">Focus history · {formatDuration(weekFocus / 1000)} this week</h3>
          {history.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={async () => {
                if (await confirm({ title: 'Clear focus history?', message: 'All recorded focus sessions will be deleted.', confirmLabel: 'Clear', danger: true })) {
                  await focusRepo.clear();
                  toast('Focus history cleared', 'success');
                }
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <ul className="divide-y divide-line text-[13px]">
          {history.slice(0, 12).map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span>{new Date(h.startedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              <span className="flex items-center gap-2">
                <span className="bt-tabular">{formatDuration(h.focusedMs / 1000)}</span>
                {h.completed ? <Badge tone="success">Completed</Badge> : <Badge>Ended early</Badge>}
              </span>
            </li>
          ))}
          {history.length === 0 && <li className="py-2 text-muted">No focus sessions yet.</li>}
        </ul>
      </div>
    </Panel>
  );
}
