import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import '@/styles/global.css';
import type { CaptureRecord } from '@/shared/types';
import { capturesRepo } from '@/storage/indexeddb/repos';
import { useApplyTheme, useLiveQuery, useSettings } from '@/shared/hooks';
import { OverlayProvider, useToast } from '@/shared/components/overlay';
import { BrandMark } from '@/shared/components/Brand';
import { Button, EmptyState, IconButton } from '@/shared/components/ui';
import { uid } from '@/shared/utils';
import { Editor } from './Editor';

function App() {
  const [settings] = useSettings();
  useApplyTheme(settings);
  const [id, setId] = useState(() => new URLSearchParams(location.search).get('id'));

  useEffect(() => {
    const onPop = () => setId(new URLSearchParams(location.search).get('id'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = (next: string | null) => {
    history.pushState(null, '', next ? `?id=${encodeURIComponent(next)}` : location.pathname);
    setId(next);
  };

  if (!settings) return null;
  return (
    <OverlayProvider>
      <div className="h-full bg-bg">{id ? <EditorLoader id={id} settings={settings} onClose={() => open(null)} /> : <Library onOpen={open} keep={settings.snappage.keepRecent} />}</div>
    </OverlayProvider>
  );
}

function EditorLoader({ id, settings, onClose }: { id: string; settings: NonNullable<ReturnType<typeof useSettings>[0]>; onClose: () => void }) {
  const [state, setState] = useState<{ capture: CaptureRecord; bitmap: ImageBitmap } | 'missing' | null>(null);

  useEffect(() => {
    let alive = true;
    let bmp: ImageBitmap | null = null;
    void (async () => {
      const capture = await capturesRepo.get(id);
      if (!capture) return alive && setState('missing');
      // Decoding happens off the main thread, so large captures don't freeze the page.
      bmp = await createImageBitmap(capture.blob);
      if (alive) setState({ capture, bitmap: bmp });
      document.title = `${capture.title || 'Screenshot'} · SnapPage`;
    })();
    return () => {
      alive = false;
      bmp?.close();
    };
  }, [id]);

  if (state === null)
    return (
      <div className="grid h-full place-items-center text-muted">
        <Loader2 className="animate-spin" aria-label="Loading screenshot" />
      </div>
    );
  if (state === 'missing')
    return (
      <div className="grid h-full place-items-center">
        <EmptyState icon={Camera} title="Screenshot not found" action={<Button onClick={onClose}>Open library</Button>}>
          It may have been removed to make room for newer captures.
        </EmptyState>
      </div>
    );
  return <Editor capture={state.capture} bitmap={state.bitmap} settings={settings} onClose={onClose} />;
}

function Library({ onOpen, keep }: { onOpen: (id: string) => void; keep: number }) {
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const { data: captures } = useLiveQuery(() => capturesRepo.list(), ['captures']);

  async function importImage(blob: Blob, name: string) {
    if (!blob.type.startsWith('image/')) return toast('That isn’t an image', 'error');
    try {
      const bmp = await createImageBitmap(blob);
      const rec: CaptureRecord = { id: uid('c_'), createdAt: Date.now(), url: '', title: name, kind: 'file', width: bmp.width, height: bmp.height, crop: null, note: null, blob };
      bmp.close();
      await capturesRepo.add(rec, keep);
      onOpen(rec.id);
    } catch {
      toast('Could not open that image', 'error');
    }
  }

  useEffect(() => {
    document.title = 'SnapPage · Brewtab';
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) void importImage(f, 'Pasted image');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        <a href="newtab.html" aria-label="Brewtab dashboard">
          <BrandMark />
        </a>
        <span className="text-muted">/</span>
        <h1 className="font-display text-xl font-medium">SnapPage</h1>
        <div className="ml-auto">
          <Button icon={ImagePlus} onClick={() => file.current?.click()}>
            Open image
          </Button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && void importImage(e.target.files[0], e.target.files[0].name), (e.target.value = ''))} />
        </div>
      </header>
      <p className="mb-5 text-[13px] text-muted">Your last {keep} screenshots, stored only on this device. You can also paste an image (Ctrl/⌘+V) to annotate it.</p>
      {captures && captures.length === 0 && (
        <div className="bt-card">
          <EmptyState icon={Camera} title="No screenshots yet">
            Use the Brewtab toolbar button on any page, right-click → Brewtab, or press Alt+Shift+S.
          </EmptyState>
        </div>
      )}
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {captures?.map((c) => (
          <Thumb key={c.id} capture={c} onOpen={() => onOpen(c.id)} onDelete={() => void capturesRepo.remove(c.id)} />
        ))}
      </ul>
    </div>
  );
}

function Thumb({ capture, onOpen, onDelete }: { capture: CaptureRecord; onOpen: () => void; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(capture.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [capture.blob]);
  return (
    <li className="bt-card group overflow-hidden">
      <button onClick={onOpen} className="block aspect-[4/3] w-full overflow-hidden bg-subtle" aria-label={`Edit ${capture.title}`}>
        {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover object-top transition group-hover:scale-[1.02]" />}
      </button>
      <div className="flex items-center gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{capture.title || 'Screenshot'}</div>
          <div className="text-[11.5px] text-muted">
            {new Date(capture.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {capture.width}×{capture.height}
          </div>
        </div>
        <IconButton icon={Trash2} label="Delete screenshot" size="sm" onClick={onDelete} />
      </div>
    </li>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
