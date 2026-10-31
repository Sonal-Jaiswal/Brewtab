import type { ModuleId } from '@/shared/types';
import { MODULE_META } from '@/dashboard/widgets/ModulesWidget';
import { Toggle } from '@/shared/components/ui';
import { Page, Panel, type SectionProps } from '../App';

const DETAILS: Record<ModuleId, string[]> = {
  scrollstop: ['Block sites always, on a schedule or during focus sessions', 'Daily time limits per site', 'Screen-time reports (needs site access)'],
  nightshift: ['Dark mode, brightness, contrast and warmth for any site', 'Font size and typeface controls', 'Per-site settings, exclusions and a schedule', 'Distraction-free reading mode'],
  snappage: ['Capture the visible area, a region or the full page', 'Crop, resize, blur, arrows, shapes, text and highlights', 'Export PNG/JPEG or copy to clipboard'],
};

export default function Modules({ settings, update }: SectionProps) {
  return (
    <Page title="Modules" description="Brewtab’s extra tools are independent. Turn off anything you don’t use and it stops running completely.">
      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(MODULE_META) as ModuleId[]).map((id) => {
          const m = MODULE_META[id];
          return (
            <Panel key={id}>
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-ctl bg-accent-soft text-accent">
                  <m.icon size={19} aria-hidden />
                </span>
                <Toggle label={`Enable ${m.name}`} checked={settings.modules[id]} onChange={(v) => void update({ modules: { [id]: v } })} />
              </div>
              <h2 className="mt-3 text-[16px] font-semibold">{m.name}</h2>
              <p className="text-[13px] text-muted">{m.blurb}</p>
              <ul className="mt-3 list-disc space-y-1 pl-4 text-[13px] text-muted">
                {DETAILS[id].map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <a href={`#${id}`} className="mt-4 inline-block text-[13px] font-medium text-accent hover:underline">
                Configure {m.name} →
              </a>
            </Panel>
          );
        })}
      </div>
    </Page>
  );
}
