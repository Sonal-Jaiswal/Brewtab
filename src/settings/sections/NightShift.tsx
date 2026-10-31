import { useState, type FormEvent } from 'react';
import { Globe, Pencil, Plus, Trash2 } from 'lucide-react';
import type { FontFamilyChoice, NightShiftPrefs } from '@/shared/types';
import { NEUTRAL_PREFS } from '@/modules/nightshift/engine';
import { SITE_ACCESS, requestPermission } from '@/shared/permissions';
import { usePermission } from '@/shared/hooks';
import { normalizeDomain } from '@/shared/utils/url';
import { Badge, Button, EmptyState, IconButton, Input, Select, SettingRow, Slider, Toggle } from '@/shared/components/ui';
import { Modal } from '@/shared/components/overlay';
import { Page, Panel, type SectionProps } from '../App';

const FONTS: { value: FontFamilyChoice; label: string }[] = [
  { value: 'default', label: 'Site default' },
  { value: 'sans', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'readable', label: 'Extra readable' },
];

export default function NightShift({ settings, update }: SectionProps) {
  const ns = settings.nightshift;
  const [siteAccess] = usePermission(SITE_ACCESS);
  const [editingSite, setEditingSite] = useState<string | null>(null);
  const [newSite, setNewSite] = useState('');
  const [newExcl, setNewExcl] = useState('');

  const addSite = (e: FormEvent) => {
    e.preventDefault();
    const d = normalizeDomain(newSite);
    if (!d) return;
    void update((s) => void (s.nightshift.sites[d] = s.nightshift.sites[d] ?? { prefs: {} }));
    setNewSite('');
    setEditingSite(d);
  };
  const addExclusion = (e: FormEvent) => {
    e.preventDefault();
    const d = normalizeDomain(newExcl);
    if (!d || ns.excluded.includes(d)) return;
    void update((s) => void s.nightshift.excluded.push(d));
    setNewExcl('');
  };

  return (
    <Page title="NightShift" description="Make any website easier on the eyes. Changes are applied with scoped CSS and never alter or read the page’s data.">
      <Panel title="Status">
        <SettingRow title="NightShift on" description="The quick switch, also in the toolbar popup.">
          <Toggle label="NightShift active" checked={ns.active} onChange={(v) => void update({ modules: { nightshift: settings.modules.nightshift || v }, nightshift: { active: v } })} />
        </SettingRow>
        <SettingRow
          title="Apply automatically on every site"
          description={siteAccess ? 'Pages are adjusted as soon as they load.' : 'Needs site access. Without it, NightShift applies to a tab when you use the toolbar popup.'}
        >
          <Toggle
            label="Apply automatically"
            checked={ns.autoApply && (!!siteAccess || __BREWTAB_E2E__)}
            onChange={async (v) => {
              if (v && !siteAccess && !__BREWTAB_E2E__ && !(await requestPermission(SITE_ACCESS))) return;
              void update({ nightshift: { autoApply: v } });
            }}
          />
        </SettingRow>
        <SettingRow title="Leave dark sites alone" description="Skips dark-mode inversion on pages that already have a dark background.">
          <Toggle label="Skip dark sites" checked={ns.skipDarkSites} onChange={(v) => void update({ nightshift: { skipDarkSites: v } })} />
        </SettingRow>
      </Panel>

      <Panel title="Default appearance" description="Used on every site unless the site has its own settings.">
        <PrefsEditor prefs={ns.global} onChange={(p) => void update({ nightshift: { global: p } })} />
      </Panel>

      <Panel title="Schedule">
        <SettingRow title="Only between set times" description="For example, from sunset to morning.">
          <Toggle label="Use schedule" checked={ns.schedule.enabled} onChange={(v) => void update({ nightshift: { schedule: { enabled: v } } })} />
        </SettingRow>
        {ns.schedule.enabled && (
          <div className="flex items-center gap-3 pt-3 text-sm">
            <Input type="time" className="!w-32" value={ns.schedule.start} onChange={(e) => void update({ nightshift: { schedule: { start: e.target.value } } })} aria-label="Start time" />
            <span className="text-muted">to</span>
            <Input type="time" className="!w-32" value={ns.schedule.end} onChange={(e) => void update({ nightshift: { schedule: { end: e.target.value } } })} aria-label="End time" />
          </div>
        )}
      </Panel>

      <Panel title="Per-site settings" description="Sites listed here use their own appearance and are enabled even when the quick switch is off.">
        <form onSubmit={addSite} className="mt-2 flex gap-2">
          <Input value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="news.example.com" aria-label="Add a site" />
          <Button type="submit" icon={Plus}>
            Add site
          </Button>
        </form>
        <ul className="mt-3 divide-y divide-line">
          {Object.entries(ns.sites).map(([host, o]) => (
            <li key={host} className="flex items-center gap-3 py-2">
              <Globe size={15} className="text-muted" aria-hidden />
              <span className="flex-1 text-sm">{host}</span>
              {o.disabled ? <Badge>Off on this site</Badge> : <Badge tone="accent">{Object.keys(o.prefs ?? {}).length ? 'Custom' : 'Default look'}</Badge>}
              <Toggle label={`NightShift on ${host}`} checked={!o.disabled} onChange={(v) => void update((s) => void (s.nightshift.sites[host] = { ...o, disabled: !v }))} />
              <IconButton icon={Pencil} label={`Edit ${host}`} size="sm" onClick={() => setEditingSite(host)} />
              <IconButton
                icon={Trash2}
                label={`Remove ${host}`}
                size="sm"
                onClick={() =>
                  void update((s) => {
                    delete s.nightshift.sites[host];
                  })
                }
              />
            </li>
          ))}
          {Object.keys(ns.sites).length === 0 && (
            <li>
              <EmptyState icon={Globe} title="No per-site settings yet">
                Use the popup on any site, or add one here.
              </EmptyState>
            </li>
          )}
        </ul>
      </Panel>

      <Panel title="Excluded sites" description="NightShift never touches these, for example banking sites or tools with their own dark mode.">
        <form onSubmit={addExclusion} className="mt-2 flex gap-2">
          <Input value={newExcl} onChange={(e) => setNewExcl(e.target.value)} placeholder="bank.example.com" aria-label="Exclude a site" />
          <Button type="submit" icon={Plus}>
            Exclude
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {ns.excluded.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-subtle py-1 pr-1 pl-3 text-[13px]">
              {d}
              <IconButton icon={Trash2} label={`Stop excluding ${d}`} size="sm" className="!h-6 !w-6" onClick={() => void update((s) => void (s.nightshift.excluded = s.nightshift.excluded.filter((x) => x !== d)))} />
            </span>
          ))}
          {ns.excluded.length === 0 && <span className="text-[13px] text-muted">No exclusions.</span>}
        </div>
      </Panel>

      {editingSite && (
        <Modal open onClose={() => setEditingSite(null)} title={`NightShift on ${editingSite}`} width="max-w-xl">
          <PrefsEditor
            prefs={{ ...ns.global, ...(ns.sites[editingSite]?.prefs ?? {}) }}
            onChange={(p) => void update((s) => void (s.nightshift.sites[editingSite] = { ...s.nightshift.sites[editingSite], prefs: { ...(s.nightshift.sites[editingSite]?.prefs ?? {}), ...p } }))}
          />
          <div className="mt-4 flex justify-between">
            <Button size="sm" variant="ghost" onClick={() => void update((s) => void (s.nightshift.sites[editingSite] = { ...s.nightshift.sites[editingSite], prefs: {} }))}>
              Use default look
            </Button>
            <Button size="sm" variant="primary" onClick={() => setEditingSite(null)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
    </Page>
  );
}

function PrefsEditor({ prefs, onChange }: { prefs: NightShiftPrefs; onChange: (p: Partial<NightShiftPrefs>) => void }) {
  const filter = [
    prefs.dark ? 'invert(1) hue-rotate(180deg)' : '',
    `brightness(${prefs.brightness / 100})`,
    `contrast(${prefs.contrast / 100})`,
    prefs.sepia ? `sepia(${prefs.sepia / 100})` : '',
  ].join(' ');
  const fontFamily = { default: undefined, sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, monospace', readable: 'Verdana, sans-serif' }[prefs.fontFamily];
  return (
    <div className="grid gap-6 pt-2 lg:grid-cols-[1fr_260px]">
      <div>
        <SettingRow title="Dark mode">
          <Toggle label="Dark mode" checked={prefs.dark} onChange={(v) => onChange({ dark: v })} />
        </SettingRow>
        <SettingRow title="Brightness">
          <div className="w-52">
            <Slider label="Brightness" min={50} max={150} value={prefs.brightness} onChange={(v) => onChange({ brightness: v })} format={(v) => `${v}%`} />
          </div>
        </SettingRow>
        <SettingRow title="Contrast">
          <div className="w-52">
            <Slider label="Contrast" min={50} max={150} value={prefs.contrast} onChange={(v) => onChange({ contrast: v })} format={(v) => `${v}%`} />
          </div>
        </SettingRow>
        <SettingRow title="Warmth (sepia)">
          <div className="w-52">
            <Slider label="Sepia" min={0} max={100} value={prefs.sepia} onChange={(v) => onChange({ sepia: v })} format={(v) => `${v}%`} />
          </div>
        </SettingRow>
        <SettingRow title="Text size" description="Works best on sites that size text relative to the page.">
          <div className="w-52">
            <Slider label="Text size" min={80} max={160} step={5} value={prefs.fontScale} onChange={(v) => onChange({ fontScale: v })} format={(v) => `${v}%`} />
          </div>
        </SettingRow>
        <SettingRow title="Typeface">
          <Select className="!w-44" value={prefs.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value as FontFamilyChoice })}>
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        <button className="mt-2 text-[12.5px] text-muted hover:text-accent" onClick={() => onChange({ ...NEUTRAL_PREFS, dark: true })}>
          Reset to plain dark mode
        </button>
      </div>
      <div aria-label="Preview" className="self-start overflow-hidden rounded-card border border-line">
        <div style={{ filter, background: '#fff', color: '#1a1a1a', fontFamily, fontSize: `${(prefs.fontScale / 100) * 13}px` }} className="p-4 leading-relaxed">
          <div className="mb-2 h-16 rounded-md" style={{ background: 'linear-gradient(135deg,#f6b26b,#6fa8dc)', filter: prefs.dark ? 'invert(1) hue-rotate(180deg)' : undefined }} />
          <strong className="block text-[1.15em]">Preview article</strong>
          <p className="mt-1 text-[#444]">This is how text and images will look with your settings. Photos keep their original colours in dark mode.</p>
          <a className="text-[#1a5fb4] underline">A link</a>
        </div>
      </div>
    </div>
  );
}
