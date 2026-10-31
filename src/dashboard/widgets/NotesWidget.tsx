import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileText, Pin, PinOff, Plus, Search, StickyNote, Trash2 } from 'lucide-react';
import type { Note } from '@/shared/types';
import { notesRepo } from '@/storage/indexeddb/repos';
import { useDebouncedCallback, useLiveQuery } from '@/shared/hooks';
import { EmptyState, IconButton, Input, cx } from '@/shared/components/ui';
import { Menu, useToast } from '@/shared/components/overlay';
import { noteTitle, notesToMarkdown, searchNotes } from '../task-views';
import { downloadBlob, timestampForFile } from '@/shared/utils';
import type { WidgetProps } from './registry';

export default function NotesWidget({ instance }: WidgetProps) {
  const toast = useToast();
  const { data: notes = [] } = useLiveQuery(() => notesRepo.list(), ['notes']);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const exportBtn = useRef<HTMLButtonElement>(null);
  const wide = instance.size.w >= 2;

  const list = useMemo(() => searchNotes(notes, query), [notes, query]);
  const active = notes.find((n) => n.id === activeId) ?? null;

  useEffect(() => {
    if (wide && !activeId && list[0]) setActiveId(list[0].id);
  }, [wide, activeId, list]);

  async function create() {
    const n = await notesRepo.create();
    setQuery('');
    setActiveId(n.id);
  }

  async function remove(n: Note) {
    await notesRepo.remove(n.id);
    if (activeId === n.id) setActiveId(null);
    toast('Note deleted', 'info', { label: 'Undo', run: () => void notesRepo.restore(n) });
  }

  function exportAs(kind: 'md' | 'json') {
    if (!notes.length) return toast('No notes to export yet');
    const blob =
      kind === 'md'
        ? new Blob([notesToMarkdown(notes)], { type: 'text/markdown' })
        : new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `brewtab-notes_${timestampForFile()}.${kind}`);
  }

  const listPane = (
    <div className={cx('flex min-h-0 min-w-0 flex-col', wide ? 'w-[42%] shrink-0 border-r border-line pr-2' : 'flex-1')}>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" className="!h-8 pl-8 text-[13px]" />
        </div>
        <IconButton icon={Plus} label="New note" size="sm" className="h-8 w-8" onClick={() => void create()} />
        <IconButton ref={exportBtn} icon={Download} label="Export notes" size="sm" className="h-8 w-8" onClick={() => setExportMenu(true)} />
        {exportMenu && (
          <Menu
            anchor={exportBtn.current}
            onClose={() => setExportMenu(false)}
            items={[
              { label: 'Export as Markdown', icon: FileText, onSelect: () => exportAs('md') },
              { label: 'Export as JSON', icon: Download, onSelect: () => exportAs('json') },
            ]}
          />
        )}
      </div>
      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
        {list.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => setActiveId(n.id)}
              className={cx('w-full rounded-ctl px-2 py-1.5 text-left hover:bg-subtle', n.id === activeId && wide && 'bg-subtle')}
            >
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                {n.pinned && <Pin size={11} className="shrink-0 text-accent" aria-label="Pinned" />}
                <span className="truncate">{noteTitle(n)}</span>
              </div>
              <div className="truncate text-[11.5px] text-muted">
                {new Date(n.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {n.body.replace(/\s+/g, ' ').slice(0, 80) || 'Empty'}
              </div>
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li>
            <EmptyState icon={StickyNote} title={query ? 'No matching notes' : 'No notes yet'}>
              {query ? 'Try a different search.' : 'Capture an idea before it disappears.'}
            </EmptyState>
          </li>
        )}
      </ul>
    </div>
  );

  if (!wide && active) {
    return <NoteEditor key={active.id} note={active} onBack={() => setActiveId(null)} onDelete={() => void remove(active)} />;
  }
  return (
    <div className="flex h-full min-w-0 gap-3">
      {listPane}
      {wide && (active ? <NoteEditor key={active.id} note={active} onDelete={() => void remove(active)} /> : <div className="flex-1" />)}
    </div>
  );
}

function NoteEditor({ note, onBack, onDelete }: { note: Note; onBack?: () => void; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saved, setSaved] = useState(true);
  const [save, flush] = useDebouncedCallback((patch: Partial<Note>) => {
    void notesRepo.update(note.id, patch).then(() => setSaved(true));
  }, 400);

  // Flush pending edits when the page is hidden or closed.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const edit = (patch: { title?: string; body?: string }) => {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) setBody(patch.body);
    setSaved(false);
    save({ title: patch.title ?? title, body: patch.body ?? body });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-1 flex items-center gap-1">
        {onBack && <IconButton icon={ArrowLeft} label="Back to notes" size="sm" onClick={() => (flush(), onBack())} />}
        <input
          value={title}
          onChange={(e) => edit({ title: e.target.value })}
          placeholder="Title"
          aria-label="Note title"
          className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted/60"
        />
        <IconButton
          icon={note.pinned ? PinOff : Pin}
          label={note.pinned ? 'Unpin note' : 'Pin note'}
          size="sm"
          active={note.pinned}
          onClick={() => void notesRepo.update(note.id, { pinned: !note.pinned })}
        />
        <IconButton icon={Trash2} label="Delete note" size="sm" onClick={onDelete} />
      </div>
      <textarea
        value={body}
        onChange={(e) => edit({ body: e.target.value })}
        onBlur={flush}
        autoFocus={!note.body && !note.title}
        placeholder="Start writing…"
        aria-label="Note text"
        className="min-h-0 flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed outline-none placeholder:text-muted/60"
      />
      <div className="pt-1 text-[11px] text-muted" aria-live="polite">
        {saved ? `Saved · edited ${new Date(note.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Saving…'} · created{' '}
        {new Date(note.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
