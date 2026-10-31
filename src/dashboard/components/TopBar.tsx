import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LayoutDashboard, Moon, Palette, Settings, ShieldBan, Timer } from 'lucide-react';
import type { Settings as SettingsT, ThemeId } from '@/shared/types';
import { useFocusState, useNow } from '@/shared/hooks';
import { remainingMs } from '@/modules/scrollstop/focus';
import { IconButton, cx } from '@/shared/components/ui';
import { BrandMark } from '@/shared/components/Brand';

export const THEMES: { id: ThemeId; name: string; swatch: string }[] = [
  { id: 'minimal-light', name: 'Minimal Light', swatch: 'linear-gradient(135deg,#fbe9d6,#f5f1ea 55%,#ece6f5)' },
  { id: 'midnight', name: 'Midnight', swatch: 'linear-gradient(135deg,#1b2440,#0c0f15 60%,#2a1a12)' },
  { id: 'nature', name: 'Nature', swatch: 'linear-gradient(180deg,#9cc3c9,#e9d9b8 45%,#5f8a63 70%,#25402d)' },
  { id: 'glass', name: 'Glass', swatch: 'linear-gradient(135deg,#ff9a8b,#7f7fd5 50%,#2ec5ce)' },
];

export function TopBar({ settings, editMode, onToggleEdit, onTheme }: { settings: SettingsT; editMode: boolean; onToggleEdit: () => void; onTheme: (t: ThemeId) => void }) {
  const [themeOpen, setThemeOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <header className="flex items-center gap-2 px-5 py-4 text-[var(--bt-hero-fg)]">
      <BrandMark className="opacity-80" />
      <div className="ml-auto flex items-center gap-1.5">
        <ModuleStatus settings={settings} />
        <div className="relative">
          <IconButton ref={btn} icon={Palette} label="Change theme" onClick={() => setThemeOpen((v) => !v)} className="!text-[var(--bt-hero-fg)] opacity-80 hover:opacity-100" aria-expanded={themeOpen} />
          {themeOpen && <ThemePopover anchor={btn.current} current={settings.appearance.theme} onPick={onTheme} onClose={() => setThemeOpen(false)} />}
        </div>
        <IconButton icon={LayoutDashboard} label={editMode ? 'Finish customising' : 'Customise dashboard'} active={editMode} onClick={onToggleEdit} className={cx(!editMode && '!text-[var(--bt-hero-fg)] opacity-80 hover:opacity-100')} />
        <a href="settings.html" aria-label="Open settings" title="Settings" className="grid h-9 w-9 place-items-center rounded-ctl opacity-80 hover:bg-subtle hover:opacity-100">
          <Settings size={18} aria-hidden />
        </a>
      </div>
    </header>
  );
}

function ModuleStatus({ settings }: { settings: SettingsT }) {
  const focus = useFocusState();
  const now = useNow(30_000);
  const pills: { key: string; icon: typeof Moon; label: string; href: string }[] = [];
  if (settings.modules.scrollstop && focus.status !== 'idle') {
    pills.push({
      key: 'focus',
      icon: Timer,
      label: `${focus.phase === 'work' ? 'Focus' : 'Break'} · ${Math.ceil(remainingMs(focus, now.getTime()) / 60_000)}m${focus.status === 'paused' ? ' paused' : ''}`,
      href: 'settings.html#scrollstop',
    });
  } else if (settings.modules.scrollstop && settings.scrollstop.alwaysOn) {
    pills.push({ key: 'block', icon: ShieldBan, label: 'Blocking on', href: 'settings.html#scrollstop' });
  }
  if (settings.modules.nightshift && settings.nightshift.active) pills.push({ key: 'night', icon: Moon, label: 'NightShift', href: 'settings.html#nightshift' });
  return (
    <ul className="mr-1 hidden items-center gap-1.5 sm:flex" aria-label="Active modules">
      {pills.map((p) => (
        <li key={p.key}>
          <a href={p.href} className="flex items-center gap-1.5 rounded-full bg-[var(--bt-surface)] px-2.5 py-1 text-xs font-medium text-fg shadow-sm backdrop-blur">
            <p.icon size={12} className="text-accent" aria-hidden />
            {p.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function ThemePopover({ anchor, current, onPick, onClose }: { anchor: HTMLElement | null; current: ThemeId; onPick: (t: ThemeId) => void; onClose: () => void }) {
  const r = anchor?.getBoundingClientRect();
  return createPortal(
    <>
      <div className="fixed inset-0 z-[140]" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-label="Themes"
        className="bt-popover bt-enter fixed z-[150] w-[296px] p-3 text-fg"
        style={{ top: (r?.bottom ?? 0) + 8, left: Math.max(8, (r?.right ?? 0) - 296) }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => onPick(t.id)} aria-pressed={current === t.id} className="group text-left" autoFocus={current === t.id}>
              <span className={cx('relative block h-16 rounded-ctl border-2 transition', current === t.id ? 'border-accent' : 'border-transparent group-hover:border-line')} style={{ background: t.swatch }}>
                {current === t.id && (
                  <span className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg">
                    <Check size={12} aria-hidden />
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs font-medium">{t.name}</span>
            </button>
          ))}
        </div>
        <a href="settings.html#appearance" className="mt-3 block text-center text-xs text-muted hover:text-accent">
          Wallpaper, colours & more →
        </a>
      </div>
    </>,
    document.body,
  );
}
