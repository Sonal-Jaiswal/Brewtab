// IndexedDB schema with explicit, ordered migrations. Never edit an existing
// migration: add a new one and bump DB_VERSION so user data upgrades in place.
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
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
import { StorageError } from '../chrome-storage/settings';

export const DB_NAME = 'brewtab';
export const DB_VERSION = 1;

export interface BrewtabDB extends DBSchema {
  tasks: { key: string; value: Task; indexes: { byDue: string; byUpdated: number } };
  notes: { key: string; value: Note; indexes: { byUpdated: number } };
  usage: { key: string; value: UsageRecord; indexes: { byDate: string; byDomain: string } };
  focusSessions: { key: string; value: FocusRecord; indexes: { byStarted: number } };
  dashboard: { key: string; value: LayoutDoc | QuickLinksDoc };
  wallpapers: { key: string; value: WallpaperRecord };
  backups: { key: string; value: BackupSnapshot; indexes: { byCreated: number } };
}

export type StoreName = StoreNames<BrewtabDB>;

type Migration = (
  db: IDBPDatabase<BrewtabDB>,
  tx: IDBPTransaction<BrewtabDB, StoreName[], 'versionchange'>,
) => void;

const migrations: Record<number, Migration> = {
  1: (db) => {
    const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
    tasks.createIndex('byDue', 'due');
    tasks.createIndex('byUpdated', 'updatedAt');
    db.createObjectStore('notes', { keyPath: 'id' }).createIndex('byUpdated', 'updatedAt');
    const usage = db.createObjectStore('usage', { keyPath: 'key' });
    usage.createIndex('byDate', 'date');
    usage.createIndex('byDomain', 'domain');
    db.createObjectStore('focusSessions', { keyPath: 'id' }).createIndex('byStarted', 'startedAt');
    db.createObjectStore('dashboard', { keyPath: 'id' });
    db.createObjectStore('wallpapers', { keyPath: 'id' });
    db.createObjectStore('backups', { keyPath: 'id' }).createIndex('byCreated', 'createdAt');
  },
};

/** Stores included in exports/imports. Binary stores are handled separately. */
export const DATA_STORES = ['tasks', 'notes', 'usage', 'focusSessions', 'dashboard'] as const;
export const MEDIA_STORES = ['wallpapers'] as const;

let dbPromise: Promise<IDBPDatabase<BrewtabDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<BrewtabDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BrewtabDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        for (let v = oldVersion + 1; v <= DB_VERSION; v++) migrations[v]?.(db, tx);
      },
      blocking() {
        // A newer version (e.g. after an update) wants to upgrade: let it.
        void dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((err) => {
      dbPromise = null;
      throw new StorageError('Could not open local database', err);
    });
  }
  return dbPromise;
}

/** For tests: close and forget the cached connection. */
export async function resetDBConnection(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
  }
  dbPromise = null;
}

/** Wrap a write so quota errors surface as a readable StorageError. */
export async function guardedWrite<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StorageError) throw err;
    throw new StorageError(`Could not save ${label}`, err);
  }
}
