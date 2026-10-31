import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookmarkPlus, Copy, FolderPlus, Pencil, Plus, Smile, Trash2, X } from 'lucide-react';
import type { LinkIcon, QuickLink } from '@/shared/types';
import { dashboardRepo } from '@/storage/indexeddb/repos';
import { onDataChange } from '@/shared/broadcast';
import { BOOKMARKS, requestPermission } from '@/shared/permissions';
import { Button, Field, Input, Segmented, Select, cx } from '@/shared/components/ui';
import { Menu, Modal, useConfirm, usePrompt, useToast, type MenuItem } from '@/shared/components/overlay';
import {
  EMPTY_LINKS,
  addFolder,
  addLink,
  findDuplicate,
  importBookmarkFolders,
  moveLink,
  removeFolder,
  removeLink,
  renameFolder,
  updateLink,
  type BookmarkSource,
  type LinksState,
} from '../quicklinks';
import { LinkAvatar, iconFromFile } from './LinkAvatar';

export function useQuickLinks() {
  const [state, setState] = useState<LinksState | null>(null);
  const load = useCallback(() => {
    void dashboardRepo.getQuickLinks().then((doc) => setState(doc ? { links: doc.links, folders: doc.folders } : EMPTY_LINKS));
  }, []);
  useEffect(() => {
    load();
    return onDataChange((t) => (t === 'dashboard' || t === 'all') && load());
  }, [load]);
  const save = useCallback(async (next: LinksState) => {
    setState(next);
    await dashboardRepo.saveQuickLinks(next);
  }, []);
  return [state, save] as const;
}

export function QuickLinks({ editMode }: { editMode: boolean }) {
  const [state, save] = useQuickLinks();
  const [folder, setFolder] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuickLink | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [menu, setMenu] = useState<{ point: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (!state) return <div className="h-[92px]" />;
  const visible = folder ? state.links.filter((l) => l.folderId === folder) : state.links;

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) void save(moveLink(state, String(e.active.id), String(e.over.id)));
  };

  const linkMenu = (link: QuickLink, point: { x: number; y: number }) =>
    setMenu({
      point,
      items: [
        { label: 'Edit', icon: Pencil, onSelect: () => setEditing(link) },
        { label: 'Copy address', icon: Copy, onSelect: () => void navigator.clipboard.writeText(link.url).then(() => toast('Address copied', 'success')) },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onSelect: () => {
            void save(removeLink(state, link.id));
            toast(`Removed ${link.title}`, 'info', { label: 'Undo', run: () => void save(state) });
          },
        },
      ],
    });

  const folderMenu = (id: string, point: { x: number; y: number }) =>
    setMenu({
      point,
      items: [
        {
          label: 'Rename folder',
          icon: Pencil,
          onSelect: async () => {
            const name = await prompt({ title: 'Rename folder', label: 'Folder name', initial: state.folders.find((f) => f.id === id)?.name });
            if (name) void save(renameFolder(state, id, name));
          },
        },
        {
          label: 'Delete folder',
          icon: Trash2,
          danger: true,
          onSelect: async () => {
            if (await confirm({ title: 'Delete folder?', message: 'Shortcuts in this folder are kept and moved to “All”.', confirmLabel: 'Delete folder', danger: true })) {
              void save(removeFolder(state, id));
              setFolder(null);
            }
          },
        },
      ],
    });

  return (
    <section aria-label="Shortcuts" className="mx-auto w-full max-w-[880px] [text-shadow:var(--bt-hero-shadow,none)]">
      {(state.folders.length > 0 || editMode) && (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label="Shortcut folders">
          <FolderChip active={folder === null} onClick={() => setFolder(null)}>
            All
          </FolderChip>
          {state.folders.map((f) => (
            <FolderChip key={f.id} active={folder === f.id} onClick={() => setFolder(f.id)} onContextMenu={(e) => (e.preventDefault(), folderMenu(f.id, { x: e.clientX, y: e.clientY }))}>
              {f.name}
            </FolderChip>
          ))}
          <button
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[var(--bt-hero-fg)] opacity-60 hover:opacity-100"
            onClick={async () => {
              const name = await prompt({ title: 'New folder', label: 'Folder name', confirmLabel: 'Create folder' });
              if (name) {
                const r = addFolder(state, name);
                void save(r.state);
                setFolder(r.folder.id);
              }
            }}
          >
            <FolderPlus size={13} aria-hidden /> Folder
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((l) => l.id)} strategy={rectSortingStrategy}>
          <ul className="flex flex-wrap justify-center gap-2" aria-label="Shortcut list">
            {visible.map((l) => (
              <SortableLink key={l.id} link={l} onContextMenu={(p) => linkMenu(l, p)} onEdit={() => setEditing(l)} editMode={editMode} />
            ))}
            <li>
              <button
                onClick={() => setEditing('new')}
                className="group flex w-[84px] flex-col items-center gap-2 rounded-card p-2.5 text-[var(--bt-hero-fg)] opacity-70 transition hover:bg-[var(--bt-surface)] hover:opacity-100"
                aria-label="Add shortcut"
              >
                <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-dashed border-current/40">
                  <Plus size={18} aria-hidden />
                </span>
                <span className="text-xs">Add</span>
              </button>
            </li>
            {state.links.length === 0 && (
              <li>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex w-[84px] flex-col items-center gap-2 rounded-card p-2.5 text-[var(--bt-hero-fg)] opacity-70 transition hover:bg-[var(--bt-surface)] hover:opacity-100"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-dashed border-current/40">
                    <BookmarkPlus size={18} aria-hidden />
                  </span>
                  <span className="text-xs">Import</span>
                </button>
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>
      {editMode && state.links.length > 0 && (
        <div className="mt-2 text-center">
          <button className="text-xs text-[var(--bt-hero-fg)] opacity-70 hover:underline hover:opacity-100" onClick={() => setImportOpen(true)}>
            Import Chrome bookmarks
          </button>
        </div>
      )}
      {menu && <Menu point={menu.point} items={menu.items} onClose={() => setMenu(null)} />}
      <LinkEditor
        state={state}
        target={editing}
        defaultFolder={folder}
        onClose={() => setEditing(null)}
        onSave={async (next) => {
          await save(next);
          setEditing(null);
        }}
      />
      <BookmarkImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (folders) => {
          const r = importBookmarkFolders(state, folders);
          await save(r.state);
          toast(`Imported ${r.added} shortcut${r.added === 1 ? '' : 's'}${r.skipped ? ` · ${r.skipped} duplicates skipped` : ''}`, 'success');
          setImportOpen(false);
        }}
      />
    </section>
  );
}

function FolderChip({ active, children, ...rest }: { active: boolean; children: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={cx(
        'rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm transition',
        active ? 'bg-[var(--bt-surface)] text-fg shadow-sm [text-shadow:none]' : 'text-[var(--bt-hero-fg)] opacity-85 hover:opacity-100',
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function SortableLink({ link, onContextMenu, onEdit, editMode }: { link: QuickLink; onContextMenu: (p: { x: number; y: number }) => void; onEdit: () => void; editMode: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }} className="relative">
      <a
        href={link.url}
        {...attributes}
        {...listeners}
        role="link"
        aria-roledescription="sortable shortcut"
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            onContextMenu({ x: r.left, y: r.bottom });
          } else listeners?.onKeyDown?.(e);
        }}
        className={cx(
          'group flex w-[84px] flex-col items-center gap-2 rounded-card p-2.5 text-[var(--bt-hero-fg)] outline-none transition hover:bg-[var(--bt-surface)] focus-visible:bg-[var(--bt-surface)]',
          isDragging && 'opacity-80 shadow-card',
        )}
        title={link.url}
      >
        <LinkAvatar title={link.title} url={link.url} icon={link.icon} size={44} />
        <span className="w-full truncate text-center text-xs">{link.title}</span>
      </a>
      {editMode && (
        <button
          onClick={onEdit}
          aria-label={`Edit ${link.title}`}
          className="absolute top-1 right-2 grid h-5 w-5 place-items-center rounded-full bg-[var(--bt-surface-solid)] text-muted shadow hover:text-fg"
        >
          <Pencil size={10} aria-hidden />
        </button>
      )}
    </li>
  );
}

function LinkEditor({
  state,
  target,
  defaultFolder,
  onClose,
  onSave,
}: {
  state: LinksState;
  target: QuickLink | 'new' | null;
  defaultFolder: string | null;
  onClose: () => void;
  onSave: (s: LinksState) => Promise<void>;
}) {
  const existing = target && target !== 'new' ? target : null;
  const [form, setForm] = useState({ title: '', url: '', folderId: '' as string, category: '' });
  const [icon, setIcon] = useState<LinkIcon>({ kind: 'letter' });
  const [error, setError] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Layout effect: fill the form before the dialog paints, so early typing isn't overwritten.
  useLayoutEffect(() => {
    if (!target) return;
    setForm({ title: existing?.title ?? '', url: existing?.url ?? '', folderId: existing?.folderId ?? defaultFolder ?? '', category: existing?.category ?? '' });
    setIcon(existing?.icon ?? { kind: 'letter' });
    setError(null);
    setAllowDuplicate(false);
  }, [target, existing, defaultFolder]);

  const duplicate = form.url ? findDuplicate(state, form.url.includes('://') ? form.url : `https://${form.url}`, existing?.id) : undefined;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (duplicate && !allowDuplicate) {
      setAllowDuplicate(true);
      return;
    }
    try {
      const input = { title: form.title, url: form.url, folderId: form.folderId || null, category: form.category, icon };
      await onSave(existing ? updateLink(state, existing.id, input) : addLink(state, input).state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save shortcut');
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={existing ? 'Edit shortcut' : 'Add shortcut'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!form.url.trim()}>
            {duplicate && allowDuplicate ? 'Add anyway' : existing ? 'Save' : 'Add shortcut'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3.5">
        <div className="flex items-center gap-3">
          <LinkAvatar title={form.title || form.url || '?'} url={form.url} icon={icon} size={52} />
          <div className="space-y-2">
            <Segmented
              label="Icon type"
              value={icon.kind}
              onChange={(k) => {
                if (k === 'letter') setIcon({ kind: 'letter' });
                if (k === 'emoji') setIcon({ kind: 'emoji', value: icon.kind === 'emoji' ? icon.value : '⭐' });
                if (k === 'image') fileInput.current?.click();
              }}
              options={[
                { value: 'letter', label: 'Letter' },
                { value: 'emoji', label: 'Emoji' },
                { value: 'image', label: 'Image' },
              ]}
            />
            {icon.kind === 'emoji' && (
              <div className="flex items-center gap-2">
                <Smile size={14} className="text-muted" aria-hidden />
                <Input aria-label="Emoji" value={icon.value} maxLength={4} onChange={(e) => setIcon({ kind: 'emoji', value: e.target.value })} className="!h-8 w-20" />
              </div>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setIcon({ kind: 'image', dataUrl: await iconFromFile(f) });
              e.target.value = '';
            }}
          />
        </div>
        <Field label="Address">
          <Input data-autofocus value={form.url} onChange={(e) => (setForm({ ...form, url: e.target.value }), setAllowDuplicate(false))} placeholder="example.com" inputMode="url" />
        </Field>
        <Field label="Name">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Leave blank to use the site name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Folder">
            <Select value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })}>
              <option value="">None</option>
              {state.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Optional label" />
          </Field>
        </div>
        {duplicate && (
          <p className="rounded-ctl bg-accent-soft px-3 py-2 text-[13px] text-accent" role="alert">
            You already have this shortcut as “{duplicate.title}”.{allowDuplicate ? ' Press “Add anyway” to keep both.' : ''}
          </p>
        )}
        {error && (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function BookmarkImport({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (folders: BookmarkSource[]) => Promise<void> }) {
  const [folders, setFolders] = useState<(chrome.bookmarks.BookmarkTreeNode & { count: number })[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!open) {
      setFolders(null);
      setDenied(false);
    }
  }, [open]);

  async function load() {
    if (!(await requestPermission(BOOKMARKS))) return setDenied(true);
    const tree = await chrome.bookmarks.getTree();
    const out: (chrome.bookmarks.BookmarkTreeNode & { count: number })[] = [];
    const count = (n: chrome.bookmarks.BookmarkTreeNode): number => (n.url ? 1 : (n.children ?? []).reduce((s, c) => s + count(c), 0));
    const walk = (n: chrome.bookmarks.BookmarkTreeNode, depth: number) => {
      if (!n.url && n.children && depth > 0) out.push({ ...n, count: count(n) });
      if (depth < 2) n.children?.forEach((c) => walk(c, depth + 1));
    };
    tree.forEach((n) => walk(n, 0));
    const withItems = out.filter((f) => f.count > 0);
    setFolders(withItems);
    setSelected(new Set(withItems.slice(0, 1).map((f) => f.id)));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Chrome bookmarks"
      footer={
        folders && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!selected.size} onClick={() => void onImport(folders.filter((f) => selected.has(f.id)))}>
              Import {selected.size} folder{selected.size === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      {!folders ? (
        <div className="space-y-3 text-sm text-muted">
          <p>Brewtab will ask Chrome for read-only access to your bookmarks. They’re copied into Brewtab on this device; nothing is uploaded.</p>
          {denied && <p className="text-danger">Permission wasn’t granted. You can try again any time.</p>}
          <Button variant="primary" icon={BookmarkPlus} onClick={() => void load()}>
            Choose folders
          </Button>
        </div>
      ) : (
        <ul className="space-y-1">
          {folders.map((f) => (
            <li key={f.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-ctl px-2 py-1.5 hover:bg-subtle">
                <input
                  type="checkbox"
                  className="accent-[var(--bt-accent)]"
                  checked={selected.has(f.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(f.id);
                    else next.delete(f.id);
                    setSelected(next);
                  }}
                />
                <span className="flex-1 text-sm">{f.title || 'Untitled'}</span>
                <span className="text-xs text-muted">{f.count}</span>
              </label>
            </li>
          ))}
          {folders.length === 0 && (
            <li className="flex items-center gap-2 text-sm text-muted">
              <X size={14} /> No bookmark folders found.
            </li>
          )}
        </ul>
      )}
    </Modal>
  );
}

