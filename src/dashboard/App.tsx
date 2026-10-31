import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useApplyTheme, useSettings } from '@/shared/hooks';
import { OverlayProvider } from '@/shared/components/overlay';
import { Background } from './components/Background';
import { TopBar } from './components/TopBar';
import { Clock, SearchBar } from './components/Hero';
import { QuickLinks } from './components/QuickLinks';
import { WidgetGrid } from './components/WidgetGrid';

const Onboarding = lazy(() => import('./components/Onboarding'));

export function App() {
  const [settings, update] = useSettings();
  const [editMode, setEditMode] = useState(false);
  useApplyTheme(settings);

  const toggleEdit = useCallback(() => setEditMode((v) => !v), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editMode && !document.querySelector('[role=dialog]')) setEditMode(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editMode]);

  if (!settings) return null;

  return (
    <OverlayProvider>
      <Background appearance={settings.appearance} />
      <div className="flex min-h-full flex-col">
        <TopBar settings={settings} editMode={editMode} onToggleEdit={toggleEdit} onTheme={(theme) => void update({ appearance: { theme } })} />
        <main className="flex flex-1 flex-col gap-[calc(var(--bt-gap)*1.6)] px-5 pb-12">
          <div className="flex flex-col gap-7 pt-[max(2vh,8px)] pb-2">
            <Clock clock={settings.clock} profile={settings.profile} />
            {settings.search.show && <SearchBar search={settings.search} onProvider={(provider) => void update({ search: { provider } })} />}
          </div>
          {settings.quickLinks.show && <QuickLinks editMode={editMode} />}
          <WidgetGrid settings={settings} editMode={editMode} onExitEdit={() => setEditMode(false)} />
        </main>
      </div>
      {!settings.onboarded && (
        <Suspense fallback={null}>
          <Onboarding settings={settings} update={update} />
        </Suspense>
      )}
    </OverlayProvider>
  );
}
