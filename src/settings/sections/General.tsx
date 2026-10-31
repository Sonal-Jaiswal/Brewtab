import { useMemo } from 'react';
import type { DateFormat } from '@/shared/types';
import { Segmented, Select, SettingRow, Toggle } from '@/shared/components/ui';
import { formatDate, greetingFor } from '@/dashboard/format';
import { DebouncedInput, Page, Panel, type SectionProps } from '../App';

export default function General({ settings, update }: SectionProps) {
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  }, []);
  const c = settings.clock;
  const now = new Date();

  return (
    <Page title="General" description="Your greeting, clock and the basics of the dashboard.">
      <Panel title="Greeting">
        <SettingRow title="Your name" description="Used in the greeting. Stored only on this device.">
          <DebouncedInput className="!w-56" value={settings.profile.name} maxLength={40} onCommit={(v) => void update({ profile: { name: v } })} placeholder="Optional" aria-label="Your name" />
        </SettingRow>
        <SettingRow title="Custom greeting" description={<>Leave blank for a time-of-day greeting. Use {'{name}'} for your name.</>}>
          <DebouncedInput className="!w-56" value={settings.profile.customGreeting} maxLength={80} onCommit={(v) => void update({ profile: { customGreeting: v } })} placeholder="e.g. Let’s go, {name}" aria-label="Custom greeting" />
        </SettingRow>
        <p className="pt-2 text-[13px] text-muted">
          Preview: <span className="font-display text-fg">{greetingFor(now, settings.profile.name, settings.profile.customGreeting)}</span>
        </p>
      </Panel>

      <Panel title="Clock & date">
        <SettingRow title="Show clock and date">
          <Toggle label="Show clock" checked={c.show} onChange={(v) => void update({ clock: { show: v } })} />
        </SettingRow>
        <SettingRow title="Time format">
          <Segmented label="Time format" value={c.format} onChange={(v) => void update({ clock: { format: v } })} options={[{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }]} />
        </SettingRow>
        <SettingRow title="Show seconds">
          <Toggle label="Show seconds" checked={c.showSeconds} onChange={(v) => void update({ clock: { showSeconds: v } })} />
        </SettingRow>
        <SettingRow title="Date format">
          <Select className="!w-56" value={c.dateFormat} onChange={(e) => void update({ clock: { dateFormat: e.target.value as DateFormat } })}>
            {(['long', 'short', 'weekday', 'iso'] as DateFormat[]).map((f) => (
              <option key={f} value={f}>
                {formatDate(now, f)}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow title="Second time zone" description="Show another city’s time next to the date.">
          <Select className="!w-56" value={c.secondaryTimezone ?? ''} onChange={(e) => void update({ clock: { secondaryTimezone: e.target.value || null } })}>
            <option value="">None</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </SettingRow>
      </Panel>

      <Panel title="Dashboard elements">
        <SettingRow title="Search bar">
          <Toggle label="Show search bar" checked={settings.search.show} onChange={(v) => void update({ search: { show: v } })} />
        </SettingRow>
        <SettingRow title="Shortcuts" description="Your quick links and folders below the search bar.">
          <Toggle label="Show shortcuts" checked={settings.quickLinks.show} onChange={(v) => void update({ quickLinks: { show: v } })} />
        </SettingRow>
      </Panel>
    </Page>
  );
}
