// Repositories: the only code that touches IndexedDB object stores directly.
import type {
  BackupSnapshot,
  FocusRecord,
  LayoutDoc,
  Note,
  QuickLinksDoc,
  Task,
  UsageRecord,
  WallpaperRecord,
} from '@/shared/types';
import { notifyChange } from '@/shared/broadcast';
import { uid } from '@/shared/utils';
import { getDB, guardedWrite } from './db';

// ---------- Tasks ----------

export type NewTask = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

export const tasksRepo = {
  async list(): Promise<Task[]> {
    return (await getDB()).getAll('tasks');
  },
  async get(id: string): Promise<Task | undefined> {
    return (await getDB()).get('tasks', id);
  },
  async create(input: NewTask): Promise<Task> {
    const title = input.title.trim();
    if (!title) throw new Error('Task title is required');
    const now = Date.now();
    const task: Task = {
      id: uid('t_'),
      title,
      notes: input.notes ?? '',
      done: input.done ?? false,
      due: input.due ?? null,
      priority: input.priority ?? 'medium',
      category: input.category?.trim() ?? '',
      createdAt: now,
      updatedAt: now,
      completedAt: input.done ? now : null,
    };
    await guardedWrite('task', async () => (await getDB()).put('tasks', task));
    notifyChange('tasks');
    return task;
  },
  async update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
    const db = await getDB();
    const existing = await db.get('tasks', id);
    if (!existing) throw new Error('Task not found');
    const next: Task = { ...existing, ...patch, id, updatedAt: Date.now() };
    if (patch.title !== undefined) {
      next.title = patch.title.trim();
      if (!next.title) throw new Error('Task title is required');
    }
    if (patch.done !== undefined && patch.done !== existing.done) next.completedAt = patch.done ? Date.now() : null;
    await guardedWrite('task', () => db.put('tasks', next));
    notifyChange('tasks');
    return next;
  },
  async remove(id: string): Promise<void> {
    await (await getDB()).delete('tasks', id);
    notifyChange('tasks');
  },
  /** Put back a deleted task exactly as it was (undo). */
  async restore(task: Task): Promise<void> {
    await guardedWrite('task', async () => (await getDB()).put('tasks', task));
    notifyChange('tasks');
  },
  async clearCompleted(): Promise<number> {
    const db = await getDB();
    const done = (await db.getAll('tasks')).filter((t) => t.done);
    const tx = db.transaction('tasks', 'readwrite');
    await Promise.all([...done.map((t) => tx.store.delete(t.id)), tx.done]);
    notifyChange('tasks');
    return done.length;
  },
};

// ---------- Notes ----------

export const notesRepo = {
  async list(): Promise<Note[]> {
    return (await getDB()).getAll('notes');
  },
  async create(input: Partial<Pick<Note, 'title' | 'body' | 'pinned'>> = {}): Promise<Note> {
    const now = Date.now();
    const note: Note = {
      id: uid('n_'),
      title: input.title ?? '',
      body: input.body ?? '',
      pinned: input.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await guardedWrite('note', async () => (await getDB()).put('notes', note));
    notifyChange('notes');
    return note;
  },
  async update(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'pinned'>>): Promise<Note> {
    const db = await getDB();
    const existing = await db.get('notes', id);
    if (!existing) throw new Error('Note not found');
    const next: Note = { ...existing, ...patch, updatedAt: Date.now() };
    await guardedWrite('note', () => db.put('notes', next));
    notifyChange('notes');
    return next;
  },
  async remove(id: string): Promise<void> {
    await (await getDB()).delete('notes', id);
    notifyChange('notes');
  },
  async restore(note: Note): Promise<void> {
    await guardedWrite('note', async () => (await getDB()).put('notes', note));
    notifyChange('notes');
  },
};

// ---------- Usage ----------

export const usageRepo = {
  /** Add seconds to a (date, domain) bucket. */
  async add(date: string, domain: string, seconds: number): Promise<UsageRecord> {
    const db = await getDB();
    const key = `${date}|${domain}`;
    const tx = db.transaction('usage', 'readwrite');
    const existing = await tx.store.get(key);
    const rec: UsageRecord = { key, date, domain, seconds: (existing?.seconds ?? 0) + seconds };
    await tx.store.put(rec);
    await tx.done;
    notifyChange('usage');
    return rec;
  },
  async forDate(date: string): Promise<UsageRecord[]> {
    return (await getDB()).getAllFromIndex('usage', 'byDate', date);
  },
  async forRange(fromDate: string, toDate: string): Promise<UsageRecord[]> {
    return (await getDB()).getAllFromIndex('usage', 'byDate', IDBKeyRange.bound(fromDate, toDate));
  },
  async pruneBefore(date: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('usage', 'readwrite');
    let cursor = await tx.store.index('byDate').openCursor(IDBKeyRange.upperBound(date, true));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  },
};

// ---------- Focus history ----------

export const focusRepo = {
  async add(rec: FocusRecord): Promise<void> {
    await guardedWrite('focus session', async () => (await getDB()).put('focusSessions', rec));
    notifyChange('focusSessions');
  },
  async recent(limit = 50): Promise<FocusRecord[]> {
    const all = await (await getDB()).getAllFromIndex('focusSessions', 'byStarted');
    return all.reverse().slice(0, limit);
  },
  async since(ts: number): Promise<FocusRecord[]> {
    return (await getDB()).getAllFromIndex('focusSessions', 'byStarted', IDBKeyRange.lowerBound(ts));
  },
  async clear(): Promise<void> {
    await (await getDB()).clear('focusSessions');
    notifyChange('focusSessions');
  },
};

// ---------- Dashboard documents ----------

export const dashboardRepo = {
  async getLayout(): Promise<LayoutDoc | undefined> {
    return (await (await getDB()).get('dashboard', 'layout')) as LayoutDoc | undefined;
  },
  async saveLayout(widgets: LayoutDoc['widgets']): Promise<void> {
    const doc: LayoutDoc = { id: 'layout', widgets, updatedAt: Date.now() };
    await guardedWrite('layout', async () => (await getDB()).put('dashboard', doc));
    notifyChange('dashboard');
  },
  async getQuickLinks(): Promise<QuickLinksDoc | undefined> {
    return (await (await getDB()).get('dashboard', 'quicklinks')) as QuickLinksDoc | undefined;
  },
  async saveQuickLinks(doc: Omit<QuickLinksDoc, 'id'>): Promise<void> {
    await guardedWrite('shortcuts', async () => (await getDB()).put('dashboard', { id: 'quicklinks', ...doc }));
    notifyChange('dashboard');
  },
};

// ---------- Wallpapers ----------

export const wallpapersRepo = {
  async add(blob: Blob): Promise<WallpaperRecord> {
    const rec: WallpaperRecord = { id: uid('w_'), createdAt: Date.now(), blob };
    await guardedWrite('wallpaper', async () => (await getDB()).put('wallpapers', rec));
    notifyChange('wallpapers');
    return rec;
  },
  async get(id: string): Promise<WallpaperRecord | undefined> {
    return (await getDB()).get('wallpapers', id);
  },
  async list(): Promise<WallpaperRecord[]> {
    return (await getDB()).getAll('wallpapers');
  },
  async remove(id: string): Promise<void> {
    await (await getDB()).delete('wallpapers', id);
    notifyChange('wallpapers');
  },
};

// ---------- Internal backups (automatic snapshot before destructive restores) ----------

export const backupsRepo = {
  async add(reason: string, payload: string, keep = 3): Promise<BackupSnapshot> {
    const db = await getDB();
    const snap: BackupSnapshot = { id: uid('b_'), createdAt: Date.now(), reason, payload };
    await guardedWrite('backup snapshot', () => db.put('backups', snap));
    const keys = await db.getAllKeysFromIndex('backups', 'byCreated');
    if (keys.length > keep) {
      const tx = db.transaction('backups', 'readwrite');
      await Promise.all([...keys.slice(0, keys.length - keep).map((k) => tx.store.delete(k)), tx.done]);
    }
    notifyChange('backups');
    return snap;
  },
  async list(): Promise<BackupSnapshot[]> {
    return (await (await getDB()).getAllFromIndex('backups', 'byCreated')).reverse();
  },
  async get(id: string): Promise<BackupSnapshot | undefined> {
    return (await getDB()).get('backups', id);
  },
  async remove(id: string): Promise<void> {
    await (await getDB()).delete('backups', id);
    notifyChange('backups');
  },
};
