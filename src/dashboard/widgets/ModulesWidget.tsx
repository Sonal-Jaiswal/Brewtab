import { Camera, Moon, ShieldBan, Settings2 } from 'lucide-react';
import type { ModuleId } from '@/shared/types';
import { useSettings } from '@/shared/hooks';
import { Toggle } from '@/shared/components/ui';
import type { WidgetProps } from './registry';

export const MODULE_META: Record<ModuleId, { name: string; icon: typeof Moon; blurb: string }> = {
  scrollstop: { name: 'ScrollStop', icon: ShieldBan, blurb: 'Blocking, focus & screen time' },
  nightshift: { name: 'NightShift', icon: Moon, blurb: 'Dark mode & reading' },
  snappage: { name: 'SnapPage', icon: Camera, blurb: 'Screenshots & markup' },
};

export default function ModulesWidget({ settings }: WidgetProps) {
  const [, update] = useSettings();
  const status = (id: ModuleId): string => {
    if (!settings.modules[id]) return 'Off';
    if (id === 'scrollstop') {
      const n = settings.scrollstop.blocklist.filter((r) => r.enabled).length;
      return settings.scrollstop.alwaysOn ? `Blocking ${n} site${n === 1 ? '' : 's'}` : `${n} site${n === 1 ? '' : 's'} · ${settings.scrollstop.schedules.filter((s) => s.enabled).length} schedules`;
    }
    if (id === 'nightshift') return settings.nightshift.active ? (settings.nightshift.autoApply ? 'On for all sites' : 'On (per tab)') : 'Ready';
    return 'Ready';
  };

  return (
    <ul className="flex h-full flex-col justify-center gap-1">
      {(Object.keys(MODULE_META) as ModuleId[]).map((id) => {
        const m = MODULE_META[id];
        return (
          <li key={id} className="flex items-center gap-3 rounded-ctl px-1.5 py-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-accent-soft text-accent">
              <m.icon size={16} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{m.name}</div>
              <div className="truncate text-[11.5px] text-muted">{status(id)}</div>
            </div>
            <Toggle label={`Enable ${m.name}`} checked={settings.modules[id]} onChange={(v) => void update({ modules: { [id]: v } })} />
          </li>
        );
      })}
      <li className="pt-1 text-center">
        <a href="settings.html#modules" className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-accent">
          <Settings2 size={12} aria-hidden /> Module settings
        </a>
      </li>
    </ul>
  );
}
