import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Check, RotateCcw } from 'lucide-react';
import type { Background, Spacing } from '@/shared/types';
import { wallpapersRepo } from '@/storage/indexeddb/repos';
import { DEFAULT_SETTINGS } from '@/storage/chrome-storage/settings';
import { useLiveQuery } from '@/shared/hooks';
import { compressWallpaper } from '@/shared/utils/image';
import { Button, Segmented, SettingRow, Slider, cx } from '@/shared/components/ui';
import { useToast } from '@/shared/components/overlay';
import { THEMES } from '@/dashboard/components/TopBar';
import { Page, Panel, type SectionProps } from '../App';

export default function Appearance({ settings, update }: SectionProps) {
  const a = settings.appearance;
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: wallpapers = [] } = useLiveQuery(() => wallpapersRepo.list(), ['wallpapers']);
  const setBg = (background: Background) => void update((s) => void (s.appearance.background = background));

  async function upload(f: File) {
    setBusy(true);
    try {
      const blob = await compressWallpaper(f);
      const rec = await wallpapersRepo.add(blob);
      setBg({ kind: 'image', wallpaperId: rec.id });
      toast('Wallpaper added', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not use that image', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Appearance" description="Themes, wallpaper and the finer details of how Brewtab looks.">
      <Panel title="Theme">
        <div className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => void update({ appearance: { theme: t.id } })} aria-pressed={a.theme === t.id} className="text-left">
              <span className={cx('relative block h-20 rounded-card border-2 transition', a.theme === t.id ? 'border-accent' : 'border-line hover:border-muted')} style={{ background: t.swatch }}>
                {a.theme === t.id && (
                  <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg">
                    <Check size={12} />
                  </span>
                )}
              </span>
              <span className="mt-1.5 block text-[13px] font-medium">{t.name}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Background" description="Use the theme’s artwork, a solid colour, or your own image. Images are compressed and kept on this device.">
        <div className="flex flex-wrap gap-2 py-2">
          <BgTile active={a.background.kind === 'theme'} onClick={() => setBg({ kind: 'theme' })} label="Theme art" style={{ background: THEMES.find((t) => t.id === a.theme)?.swatch }} />
          <label className={cx('relative h-16 w-24 cursor-pointer overflow-hidden rounded-ctl border-2', a.background.kind === 'color' ? 'border-accent' : 'border-line')}>
            <input
              type="color"
              aria-label="Background colour"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={a.background.kind === 'color' ? a.background.color : '#2b2b2b'}
              onChange={(e) => setBg({ kind: 'color', color: e.target.value })}
            />
            <span className="block h-full w-full" style={{ background: a.background.kind === 'color' ? a.background.color : 'conic-gradient(#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f87171)' }} />
            <span className="absolute inset-x-0 bottom-0 bg-black/40 py-0.5 text-center text-[10.5px] text-white">Colour</span>
          </label>
          {wallpapers.map((w) => (
            <WallpaperTile
              key={w.id}
              blob={w.blob}
              active={a.background.kind === 'image' && a.background.wallpaperId === w.id}
              onPick={() => setBg({ kind: 'image', wallpaperId: w.id })}
              onDelete={async () => {
                await wallpapersRepo.remove(w.id);
                if (a.background.kind === 'image' && a.background.wallpaperId === w.id) setBg({ kind: 'theme' });
              }}
            />
          ))}
          <button
            onClick={() => file.current?.click()}
            disabled={busy}
            className="grid h-16 w-24 place-items-center rounded-ctl border-2 border-dashed border-line text-muted hover:border-accent hover:text-accent"
            aria-label="Upload wallpaper"
          >
            <ImagePlus size={18} />
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ''))} />
        </div>
        <SettingRow title="Background opacity">
          <div className="w-60">
            <Slider label="Background opacity" min={0} max={1} step={0.05} value={a.backgroundOpacity} onChange={(v) => void update({ appearance: { backgroundOpacity: v } })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </SettingRow>
        <SettingRow title="Background blur">
          <div className="w-60">
            <Slider label="Background blur" min={0} max={40} value={a.backgroundBlur} onChange={(v) => void update({ appearance: { backgroundBlur: v } })} format={(v) => `${v}px`} />
          </div>
        </SettingRow>
      </Panel>

      <Panel title="Widgets & text">
        <SettingRow title="Widget transparency" description="Lower values let more of the background show through.">
          <div className="w-60">
            <Slider label="Widget opacity" min={0.2} max={1} step={0.02} value={a.widgetOpacity} onChange={(v) => void update({ appearance: { widgetOpacity: v } })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </SettingRow>
        <SettingRow title="Card corner radius">
          <div className="w-60">
            <Slider label="Corner radius" min={0} max={32} value={a.radius} onChange={(v) => void update({ appearance: { radius: v } })} format={(v) => `${v}px`} />
          </div>
        </SettingRow>
        <SettingRow title="Spacing">
          <Segmented<Spacing>
            label="Spacing"
            value={a.spacing}
            onChange={(v) => void update({ appearance: { spacing: v } })}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'cozy', label: 'Cozy' },
              { value: 'roomy', label: 'Roomy' },
            ]}
          />
        </SettingRow>
        <SettingRow title="Text colour" description="Override the theme’s text colour. Check that it stays readable.">
          <div className="flex items-center gap-2">
            <Segmented
              label="Text colour mode"
              value={a.textColor === 'auto' ? 'auto' : 'custom'}
              onChange={(v) => void update({ appearance: { textColor: v === 'auto' ? 'auto' : '#1e1b18' } })}
              options={[
                { value: 'auto', label: 'Theme' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {a.textColor !== 'auto' && (
              <input type="color" aria-label="Text colour" value={a.textColor} onChange={(e) => void update({ appearance: { textColor: e.target.value } })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
            )}
          </div>
        </SettingRow>
        <SettingRow title="Animations" description="“System” follows your operating system’s reduced-motion setting.">
          <Segmented
            label="Animations"
            value={a.reduceMotion}
            onChange={(v) => void update({ appearance: { reduceMotion: v } })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'off', label: 'On' },
              { value: 'on', label: 'Reduced' },
            ]}
          />
        </SettingRow>
        <div className="pt-3">
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void update((s) => void (s.appearance = { ...structuredClone(DEFAULT_SETTINGS.appearance), theme: s.appearance.theme, background: s.appearance.background }))}>
            Reset fine-tuning
          </Button>
        </div>
      </Panel>
    </Page>
  );
}

function BgTile({ active, onClick, label, style }: { active: boolean; onClick: () => void; label: string; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cx('relative h-16 w-24 overflow-hidden rounded-ctl border-2', active ? 'border-accent' : 'border-line')} style={style}>
      <span className="absolute inset-x-0 bottom-0 bg-black/40 py-0.5 text-center text-[10.5px] text-white">{label}</span>
    </button>
  );
}

function WallpaperTile({ blob, active, onPick, onDelete }: { blob: Blob; active: boolean; onPick: () => void; onDelete: () => void }) {
  const [url] = useState(() => URL.createObjectURL(blob));
  return (
    <div className="group relative">
      <button onClick={onPick} aria-pressed={active} aria-label="Use this wallpaper" className={cx('block h-16 w-24 overflow-hidden rounded-ctl border-2 bg-cover bg-center', active ? 'border-accent' : 'border-line')} style={{ backgroundImage: `url(${url})` }} />
      <button onClick={onDelete} aria-label="Delete wallpaper" className="absolute -top-2 -right-2 hidden h-6 w-6 place-items-center rounded-full bg-[var(--bt-surface-solid)] text-danger shadow group-hover:grid focus:grid">
        <Trash2 size={12} />
      </button>
    </div>
  );
}
