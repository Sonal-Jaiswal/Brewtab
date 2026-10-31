// Export / import / backup / restore / clear-all for every piece of local data.
// Imports are validated item by item; invalid entries are dropped and counted,
// never silently written. "Replace" always snapshots current data first.
import type { LayoutDoc, QuickLinksDoc, Settings } from '@/shared/types';
import { isPlainObject } from '@/shared/utils';
import { notifyChange } from '@/shared/broadcast';
import { DATA_STORES, getDB, type StoreName } from './indexeddb/db';
import { backupsRepo } from './indexeddb/repos';
import { DEFAULT_SETTINGS, getSettings, migrateSettings, saveSettings } from './chrome-storage/settings';
import { canonicalUrl } from '@/shared/utils/url';

export const BACKUP_FORMAT = 1;
type DataStore = (typeof DATA_STORES)[number];

export interface MediaItem {
  id: string;
  createdAt: number;
  dataUrl: string;
  meta?: Record<string, unknown>;
}

export interface BackupFile {
  app: 'brewtab';
  format: number;
  exportedAt: string;
  appVersion: string;
  settings: Settings | null;
  data: Record<DataStore, unknown[]>;
  media?: { wallpapers: MediaItem[]; captures: MediaItem[] };
}

export interface BackupSummary {
  counts: Record<DataStore, number>;
  invalid: number;
  hasSettings: boolean;
  media: number;
  exportedAt: string;
}

function appVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return 'dev';
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Invalid data URL');
  const bytes = m[2] ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]));
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
}

export async function createBackup(options: { includeMedia?: boolean } = {}): Promise<BackupFile> {
  const db = await getDB();
  const data = {} as Record<DataStore, unknown[]>;
  for (const store of DATA_STORES) data[store] = await db.getAll(store);
  const file: BackupFile = {
    app: 'brewtab',
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion(),
    settings: await getSettings(),
    data,
  };
  if (options.includeMedia) {
    const wallpapers = await db.getAll('wallpapers');
    const captures = await db.getAll('captures');
    file.media = {
      wallpapers: await Promise.all(wallpapers.map(async (w) => ({ id: w.id, createdAt: w.createdAt, dataUrl: await blobToDataUrl(w.blob) }))),
      captures: await Promise.all(
        captures.map(async ({ blob, ...meta }) => ({ id: meta.id, createdAt: meta.createdAt, dataUrl: await blobToDataUrl(blob), meta })),
      ),
    };
  }
  return file;
}

// ---------- Validation ----------

const str = (v: unknown) => typeof v === 'string';
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const bool = (v: unknown) => typeof v === 'boolean';

const validators: Record<DataStore, (v: Record<string, unknown>) => boolean> = {
  tasks: (v) => str(v.id) && str(v.title) && bool(v.done) && num(v.createdAt) && num(v.updatedAt) && (v.due === null || str(v.due)),
  notes: (v) => str(v.id) && str(v.title) && str(v.body) && num(v.createdAt) && num(v.updatedAt),
  usage: (v) => str(v.key) && str(v.date) && str(v.domain) && num(v.seconds) && (v.seconds as number) >= 0,
  focusSessions: (v) => str(v.id) && num(v.startedAt) && num(v.endedAt) && num(v.focusedMs),
  dashboard: (v) =>
    (v.id === 'layout' && Array.isArray(v.widgets)) ||
    (v.id === 'quicklinks' && Array.isArray(v.links) && Array.isArray(v.folders)),
};

export type ParseResult = { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; error: string };

/** Parse and validate a backup file's text. Invalid records are removed and counted. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!isPlainObject(raw) || raw.app !== 'brewtab') return { ok: false, error: 'This is not a Brewtab backup file.' };
  if (!num(raw.format) || (raw.format as number) > BACKUP_FORMAT) {
    return { ok: false, error: 'This backup was made by a newer version of Brewtab. Update the extension first.' };
  }
  const rawData = isPlainObject(raw.data) ? raw.data : {};
  const data = {} as Record<DataStore, unknown[]>;
  const counts = {} as Record<DataStore, number>;
  let invalid = 0;
  for (const store of DATA_STORES) {
    const items = Array.isArray(rawData[store]) ? (rawData[store] as unknown[]) : [];
    const valid = items.filter((it) => isPlainObject(it) && validators[store](it));
    invalid += items.length - valid.length;
    data[store] = valid;
    counts[store] = valid.length;
  }
  let media: BackupFile['media'];
  if (isPlainObject(raw.media)) {
    const clean = (list: unknown) =>
      (Array.isArray(list) ? list : []).filter(
        (m): m is MediaItem => isPlainObject(m) && str(m.id) && num(m.createdAt) && str(m.dataUrl) && (m.dataUrl as string).startsWith('data:image/'),
      );
    media = { wallpapers: clean(raw.media.wallpapers), captures: clean(raw.media.captures) };
  }
  const settings = isPlainObject(raw.settings) ? migrateSettings(raw.settings) : null;
  const backup: BackupFile = {
    app: 'brewtab',
    format: raw.format as number,
    exportedAt: str(raw.exportedAt) ? (raw.exportedAt as string) : '',
    appVersion: str(raw.appVersion) ? (raw.appVersion as string) : '',
    settings,
    data,
    media,
  };
  return {
    ok: true,
    backup,
    summary: {
      counts,
      invalid,
      hasSettings: settings !== null,
      media: (media?.wallpapers.length ?? 0) + (media?.captures.length ?? 0),
      exportedAt: backup.exportedAt,
    },
  };
}

// ---------- Import ----------

export interface ImportOptions {
  mode: 'merge' | 'replace';
  includeSettings: boolean;
}

export interface ImportReport {
  added: number;
  updated: number;
  skipped: number;
  snapshotId: string | null;
}

function keyOf(store: DataStore, item: Record<string, unknown>): string {
  return (store === 'usage' ? item.key : item.id) as string;
}

function mergeQuickLinks(current: QuickLinksDoc, incoming: QuickLinksDoc): QuickLinksDoc {
  const ids = new Set(current.links.map((l) => l.id));
  const urls = new Set(current.links.map((l) => canonicalUrl(l.url)));
  const links = [...current.links];
  for (const l of incoming.links) {
    if (ids.has(l.id) || urls.has(canonicalUrl(l.url))) continue;
    links.push(l);
  }
  const folderIds = new Set(current.folders.map((f) => f.id));
  return { id: 'quicklinks', links, folders: [...current.folders, ...incoming.folders.filter((f) => !folderIds.has(f.id))] };
}

export async function importBackup(backup: BackupFile, options: ImportOptions): Promise<ImportReport> {
  const db = await getDB();
  const report: ImportReport = { added: 0, updated: 0, skipped: 0, snapshotId: null };

  if (options.mode === 'replace') {
    const snapshot = await createBackup();
    report.snapshotId = (await backupsRepo.add('Before replacing data with an import', JSON.stringify(snapshot))).id;
  }

  const stores: StoreName[] = [...DATA_STORES, 'wallpapers', 'captures'];
  const tx = db.transaction(stores, 'readwrite');
  for (const store of DATA_STORES) {
    const os = tx.objectStore(store);
    if (options.mode === 'replace') await os.clear();
    for (const raw of backup.data[store] as Record<string, unknown>[]) {
      const key = keyOf(store, raw);
      const existing = options.mode === 'merge' ? ((await os.get(key)) as Record<string, unknown> | undefined) : undefined;
      if (!existing) {
        await os.put(raw as never);
        report.added++;
        continue;
      }
      if (store === 'dashboard') {
        if (raw.id === 'quicklinks') {
          await os.put(mergeQuickLinks(existing as unknown as QuickLinksDoc, raw as unknown as QuickLinksDoc));
          report.updated++;
        } else {
          report.skipped++; // keep the current layout when merging
        }
      } else if (store === 'usage') {
        const merged = { ...existing, seconds: Math.max(existing.seconds as number, raw.seconds as number) };
        await os.put(merged as never);
        report.updated++;
      } else if (num(raw.updatedAt) && num(existing.updatedAt) && (raw.updatedAt as number) > (existing.updatedAt as number)) {
        await os.put(raw as never);
        report.updated++;
      } else {
        report.skipped++;
      }
    }
  }
  if (backup.media) {
    for (const w of backup.media.wallpapers) {
      await tx.objectStore('wallpapers').put({ id: w.id, createdAt: w.createdAt, blob: dataUrlToBlob(w.dataUrl) });
      report.added++;
    }
    for (const c of backup.media.captures) {
      const meta = isPlainObject(c.meta) ? c.meta : {};
      await tx.objectStore('captures').put({
        url: '',
        title: 'Imported capture',
        kind: 'file',
        width: 0,
        height: 0,
        crop: null,
        note: null,
        ...meta,
        id: c.id,
        createdAt: c.createdAt,
        blob: dataUrlToBlob(c.dataUrl),
      } as never);
      report.added++;
    }
  }
  await tx.done;

  if (options.includeSettings && backup.settings) {
    const current = await getSettings();
    // Keep onboarding state from this installation.
    await saveSettings({ ...backup.settings, onboarded: current.onboarded || backup.settings.onboarded });
  }
  notifyChange('all');
  return report;
}

/** Restore one of the automatic snapshots taken before a destructive import. */
export async function restoreSnapshot(id: string): Promise<ImportReport> {
  const snap = await backupsRepo.get(id);
  if (!snap) throw new Error('Snapshot not found');
  const parsed = parseBackup(snap.payload);
  if (!parsed.ok) throw new Error(parsed.error);
  return importBackup(parsed.backup, { mode: 'replace', includeSettings: true });
}

/** Erase every piece of Brewtab data on this device. */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const all: StoreName[] = [...DATA_STORES, 'captures', 'wallpapers', 'backups'];
  const tx = db.transaction(all, 'readwrite');
  await Promise.all([...all.map((s) => tx.objectStore(s).clear()), tx.done]);
  await chrome.storage.local.clear();
  await chrome.storage.session?.clear();
  await saveSettings({ ...structuredClone(DEFAULT_SETTINGS) });
  notifyChange('all');
}

export function isLayoutDoc(v: unknown): v is LayoutDoc {
  return isPlainObject(v) && v.id === 'layout' && Array.isArray(v.widgets);
}
