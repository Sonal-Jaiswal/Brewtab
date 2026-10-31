import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusState, Settings } from '@/shared/types';
import { getSettings, onSettingsChanged, updateSettings } from '@/storage/chrome-storage/settings';
import { FOCUS_KEY, getFocusState } from '@/storage/chrome-storage/runtime-state';
import { onDataChange, type DataTopic } from '@/shared/broadcast';
import { hasPermission } from '@/shared/permissions';
import type { DeepPartial } from '@/shared/utils';

/** Live settings shared across every open Brewtab page. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    void getSettings().then((s) => alive && setSettings(s));
    const off = onSettingsChanged((s) => setSettings(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  const update = useCallback(async (patch: DeepPartial<Settings> | ((s: Settings) => Settings | void)) => {
    const next = await updateSettings(patch);
    setSettings(next);
    return next;
  }, []);
  return [settings, update] as const;
}

/** Re-run a query whenever the given data topics change (in any tab). */
export function useLiveQuery<T>(query: () => Promise<T>, topics: DataTopic[], deps: unknown[] = []): { data: T | undefined; error: Error | null; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const seq = useRef(0);

  const reload = useCallback(() => {
    const n = ++seq.current;
    queryRef.current().then(
      (d) => n === seq.current && (setData(d), setError(null)),
      (e: unknown) => n === seq.current && setError(e instanceof Error ? e : new Error(String(e))),
    );
  }, []);

  useEffect(() => {
    reload();
    return onDataChange((t) => {
      if (t === 'all' || topics.includes(t)) reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, topics.join(), ...deps]);

  return { data, error, reload };
}

/** Current time, ticking at the given interval and aligned to the boundary. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      t = setTimeout(tick, intervalMs - (d.getTime() % intervalMs) + 5);
    };
    t = setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 5);
    const onVis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);
  return now;
}

export function useFocusState(): FocusState {
  const [state, setState] = useState<FocusState>({ status: 'idle' });
  useEffect(() => {
    void getFocusState().then(setState);
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && FOCUS_KEY in changes) setState((changes[FOCUS_KEY].newValue as FocusState) ?? { status: 'idle' });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return state;
}

export function usePermission(p: chrome.permissions.Permissions): [boolean | null, () => void] {
  const [granted, setGranted] = useState<boolean | null>(null);
  const key = JSON.stringify(p);
  const check = useCallback(() => void hasPermission(JSON.parse(key)).then(setGranted), [key]);
  useEffect(() => {
    check();
    chrome.permissions.onAdded?.addListener(check);
    chrome.permissions.onRemoved?.addListener(check);
    return () => {
      chrome.permissions.onAdded?.removeListener(check);
      chrome.permissions.onRemoved?.removeListener(check);
    };
  }, [check]);
  return [granted, check];
}

/** Apply theme tokens and appearance overrides to <html>. */
export function useApplyTheme(settings: Settings | null): void {
  useEffect(() => {
    if (!settings) return;
    applyTheme(settings);
  }, [settings]);
}

export function applyTheme(settings: Settings): void {
  const a = settings.appearance;
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  if (a.reduceMotion === 'system') delete root.dataset.motion;
  else root.dataset.motion = a.reduceMotion === 'on' ? 'off' : 'on';
  root.style.setProperty('--bt-radius', `${a.radius}px`);
  root.style.setProperty('--bt-widget-alpha', String(a.widgetOpacity));
  root.style.setProperty('--bt-gap', { compact: '12px', cozy: '20px', roomy: '28px' }[a.spacing]);
  if (a.textColor !== 'auto' && /^#[0-9a-f]{6}$/i.test(a.textColor)) {
    root.style.setProperty('--bt-fg', a.textColor);
    root.style.setProperty('--bt-hero-fg', a.textColor);
  } else {
    root.style.removeProperty('--bt-fg');
    root.style.removeProperty('--bt-hero-fg');
  }
  try {
    // Lets the next page paint the right background before settings load.
    localStorage.setItem('brewtab-theme', a.theme);
  } catch {
    /* storage unavailable */
  }
}

export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<A | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current) {
      const args = pending.current;
      pending.current = null;
      fnRef.current(...args);
    }
  }, []);
  useEffect(() => flush, [flush]);
  const call = useCallback(
    (...args: A) => {
      pending.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, ms);
    },
    [ms, flush],
  );
  return [call, flush] as const;
}
