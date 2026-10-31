import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Blocks, Camera, Database, Info, KeyRound, LayoutGrid, Moon, Palette, Search, ShieldBan, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { Settings } from '@/shared/types';
import type { DeepPartial } from '@/shared/utils';
import { useApplyTheme, useDebouncedCallback, useSettings } from '@/shared/hooks';
import { OverlayProvider } from '@/shared/components/overlay';
import { BrandMark } from '@/shared/components/Brand';
import { Input, cx } from '@/shared/components/ui';

export interface SectionProps {
  settings: Settings;
  update: (patch: DeepPartial<Settings> | ((s: Settings) => Settings | void)) => Promise<Settings>;
}

const SECTIONS: { id: string; label: string; icon: LucideIcon; component: React.LazyExoticComponent<(p: SectionProps) => ReactNode> }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal, component: lazy(() => import('./sections/General')) },
  { id: 'search', label: 'Search', icon: Search, component: lazy(() => import('./sections/SearchSection')) },
  { id: 'appearance', label: 'Appearance', icon: Palette, component: lazy(() => import('./sections/Appearance')) },
  { id: 'widgets', label: 'Dashboard', icon: LayoutGrid, component: lazy(() => import('./sections/Widgets')) },
  { id: 'modules', label: 'Modules', icon: Blocks, component: lazy(() => import('./sections/Modules')) },
  { id: 'scrollstop', label: 'ScrollStop', icon: ShieldBan, component: lazy(() => import('./sections/ScrollStop')) },
  { id: 'nightshift', label: 'NightShift', icon: Moon, component: lazy(() => import('./sections/NightShift')) },
  { id: 'snappage', label: 'SnapPage', icon: Camera, component: lazy(() => import('./sections/SnapPageSection')) },
  { id: 'permissions', label: 'Permissions', icon: KeyRound, component: lazy(() => import('./sections/Permissions')) },
  { id: 'data', label: 'Data & backup', icon: Database, component: lazy(() => import('./sections/Data')) },
  { id: 'about', label: 'About & privacy', icon: Info, component: lazy(() => import('./sections/About')) },
];

function currentSection(): string {
  const id = location.hash.slice(1).split('?')[0];
  return SECTIONS.some((s) => s.id === id) ? id : 'general';
}

export function App() {
  const [settings, update] = useSettings();
  const [section, setSection] = useState(currentSection);
  useApplyTheme(settings);

  useEffect(() => {
    const onHash = () => setSection(currentSection());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = `${SECTIONS.find((s) => s.id === section)?.label} · Brewtab Settings`;
  }, [section]);

  if (!settings) return null;
  const Active = SECTIONS.find((s) => s.id === section)!.component;

  return (
    <OverlayProvider>
      <div className="min-h-full bg-bg" style={{ backgroundImage: 'var(--bt-bg-image)', backgroundAttachment: 'fixed', backgroundSize: 'cover' }}>
        <div className="mx-auto flex max-w-[1120px] gap-8 px-6 py-8 max-md:flex-col">
          <nav aria-label="Settings sections" className="w-56 shrink-0 max-md:w-full">
            <a href="newtab.html" className="mb-6 block px-2" aria-label="Back to Brewtab dashboard">
              <BrandMark />
            </a>
            <ul className="space-y-0.5 max-md:flex max-md:flex-wrap max-md:gap-1 max-md:space-y-0">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={section === s.id ? 'page' : undefined}
                    className={cx(
                      'flex items-center gap-2.5 rounded-ctl px-3 py-2 text-[13.5px] font-medium transition-colors',
                      section === s.id ? 'bg-[var(--bt-surface)] text-fg shadow-sm' : 'text-muted hover:bg-subtle hover:text-fg',
                    )}
                  >
                    <s.icon size={16} aria-hidden className={section === s.id ? 'text-accent' : ''} />
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <main className="min-w-0 flex-1 pb-16">
            <Suspense fallback={<div className="bt-card h-64 animate-pulse" />}>
              <Active settings={settings} update={update} />
            </Suspense>
          </main>
        </div>
      </div>
    </OverlayProvider>
  );
}

export function Page({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="bt-enter space-y-5">
      <header>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] text-muted">{description}</p>}
      </header>
      {children}
    </div>
  );
}

export function Panel({ title, description, children, actions }: { title?: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bt-card p-5">
      {(title || actions) && (
        <div className="mb-2 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Text input that keeps local state and writes to storage at most every 400ms. */
export function DebouncedInput({ value, onCommit, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [commit, flush] = useDebouncedCallback(onCommit, 400);
  useEffect(() => setLocal((cur) => (document.activeElement?.getAttribute('data-debounced') === 'true' ? cur : value)), [value]);
  return (
    <Input
      {...rest}
      data-debounced="true"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        commit(e.target.value);
      }}
      onBlur={flush}
    />
  );
}
