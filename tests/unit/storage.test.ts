import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, migrateSettings, updateSettings } from '@/storage/chrome-storage/settings';
import { notesRepo, tasksRepo, usageRepo, dashboardRepo } from '@/storage/indexeddb/repos';
import { clearAllData, createBackup, importBackup, parseBackup } from '@/storage/backup';
import { backupsRepo } from '@/storage/indexeddb/repos';
import { resetDBConnection } from '@/storage/indexeddb/db';

describe('settings', () => {
  it('returns defaults on a fresh install', async () => {
    const s = await getSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.onboarded).toBe(false);
  });

  it('persists partial updates and keeps other fields', async () => {
    await updateSettings({ appearance: { theme: 'midnight' } });
    await updateSettings({ profile: { name: 'Ada' } });
    const s = await getSettings();
    expect(s.appearance.theme).toBe('midnight');
    expect(s.appearance.radius).toBe(DEFAULT_SETTINGS.appearance.radius);
    expect(s.profile.name).toBe('Ada');
  });

  it('serialises concurrent updates', async () => {
    await Promise.all([
      updateSettings((s) => void s.scrollstop.blocklist.push({ id: '1', kind: 'domain', value: 'a.com', enabled: true, createdAt: 1 })),
      updateSettings((s) => void s.scrollstop.blocklist.push({ id: '2', kind: 'domain', value: 'b.com', enabled: true, createdAt: 2 })),
    ]);
    expect((await getSettings()).scrollstop.blocklist.map((r) => r.value)).toEqual(['a.com', 'b.com']);
  });

  it('migrates older or partial stored data without losing values', () => {
    const s = migrateSettings({ version: 0, profile: { name: 'Lin' }, appearance: { theme: 'nope', radius: 999 } });
    expect(s.profile.name).toBe('Lin');
    expect(s.appearance.theme).toBe('minimal-light');
    expect(s.appearance.radius).toBe(32);
    expect(s.clock).toEqual(DEFAULT_SETTINGS.clock);
  });

  it('recovers from corrupt stored settings', () => {
    expect(migrateSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings({ scrollstop: { blocklist: 'x' } }).scrollstop.blocklist).toEqual([]);
  });
});

describe('tasks repository', () => {
  it('creates, edits, completes and deletes tasks', async () => {
    const t = await tasksRepo.create({ title: '  Write report ', priority: 'high', due: '2026-11-02', category: 'Work' });
    expect(t.title).toBe('Write report');
    const edited = await tasksRepo.update(t.id, { title: 'Write final report' });
    expect(edited.title).toBe('Write final report');
    const done = await tasksRepo.update(t.id, { done: true });
    expect(done.completedAt).not.toBeNull();
    const undone = await tasksRepo.update(t.id, { done: false });
    expect(undone.completedAt).toBeNull();
    await tasksRepo.remove(t.id);
    expect(await tasksRepo.list()).toHaveLength(0);
  });

  it('rejects empty titles', async () => {
    await expect(tasksRepo.create({ title: '   ' })).rejects.toThrow();
  });

  it('persists across database reconnects', async () => {
    await tasksRepo.create({ title: 'Persist me' });
    await resetDBConnection();
    expect((await tasksRepo.list()).map((t) => t.title)).toEqual(['Persist me']);
  });
});

describe('notes repository', () => {
  it('creates, updates timestamps, pins and deletes', async () => {
    const n = await notesRepo.create({ title: 'Idea' });
    await new Promise((r) => setTimeout(r, 5));
    const u = await notesRepo.update(n.id, { body: 'More detail', pinned: true });
    expect(u.updatedAt).toBeGreaterThan(n.updatedAt);
    expect(u.createdAt).toBe(n.createdAt);
    expect(u.pinned).toBe(true);
    await notesRepo.remove(n.id);
    expect(await notesRepo.list()).toEqual([]);
  });
});

describe('usage repository', () => {
  it('accumulates seconds per day and domain', async () => {
    await usageRepo.add('2026-10-30', 'a.com', 30);
    await usageRepo.add('2026-10-30', 'a.com', 45);
    await usageRepo.add('2026-10-31', 'a.com', 10);
    expect((await usageRepo.forDate('2026-10-30'))[0].seconds).toBe(75);
    expect(await usageRepo.forRange('2026-10-29', '2026-10-31')).toHaveLength(2);
    await usageRepo.pruneBefore('2026-10-31');
    expect(await usageRepo.forRange('2026-01-01', '2026-12-31')).toHaveLength(1);
  });
});

describe('backup and restore', () => {
  it('round-trips data through export and import', async () => {
    await tasksRepo.create({ title: 'Task A' });
    await notesRepo.create({ title: 'Note A', body: 'hello' });
    await updateSettings({ profile: { name: 'Sam' } });
    const backup = await createBackup();
    const text = JSON.stringify(backup);

    await clearAllData();
    expect(await tasksRepo.list()).toEqual([]);
    expect((await getSettings()).profile.name).toBe('');

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.counts.tasks).toBe(1);
    await importBackup(parsed.backup, { mode: 'replace', includeSettings: true });
    expect((await tasksRepo.list())[0].title).toBe('Task A');
    expect((await notesRepo.list())[0].body).toBe('hello');
    expect((await getSettings()).profile.name).toBe('Sam');
  });

  it('rejects files that are not Brewtab backups', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{"app":"other"}').ok).toBe(false);
    expect(parseBackup('{"app":"brewtab","format":99}').ok).toBe(false);
  });

  it('drops invalid records and reports them', () => {
    const r = parseBackup(JSON.stringify({ app: 'brewtab', format: 1, data: { tasks: [{ id: 1 }, { nope: true }], notes: 'x' } }));
    expect(r.ok && r.summary.invalid).toBe(2);
    expect(r.ok && r.summary.counts.tasks).toBe(0);
  });

  it('merge keeps newer local items and never overwrites silently', async () => {
    const local = await tasksRepo.create({ title: 'Local newer' });
    const backup = await createBackup();
    const older = { ...(backup.data.tasks[0] as object), title: 'Imported older', updatedAt: 1 };
    const brandNew = { ...(backup.data.tasks[0] as object), id: 't_new', title: 'Imported new' };
    backup.data.tasks = [older, brandNew];
    const report = await importBackup(backup, { mode: 'merge', includeSettings: false });
    expect(report).toMatchObject({ added: 1, skipped: 1 });
    expect((await tasksRepo.get(local.id))?.title).toBe('Local newer');
  });

  it('replace takes a snapshot first so it can be undone', async () => {
    await tasksRepo.create({ title: 'Precious' });
    const empty = parseBackup(JSON.stringify({ app: 'brewtab', format: 1, data: {} }));
    if (!empty.ok) throw new Error('parse failed');
    const report = await importBackup(empty.backup, { mode: 'replace', includeSettings: false });
    expect(await tasksRepo.list()).toEqual([]);
    expect(report.snapshotId).toBeTruthy();
    const snaps = await backupsRepo.list();
    expect(snaps).toHaveLength(1);
    const { restoreSnapshot } = await import('@/storage/backup');
    await restoreSnapshot(snaps[0].id);
    expect((await tasksRepo.list())[0].title).toBe('Precious');
  });

  it('merges quick links without creating duplicates', async () => {
    await dashboardRepo.saveQuickLinks({
      links: [{ id: 'a', title: 'A', url: 'https://a.com/', icon: { kind: 'letter' }, folderId: null, category: '', createdAt: 1 }],
      folders: [],
    });
    const backup = await createBackup();
    const doc = backup.data.dashboard[0] as { links: unknown[] };
    doc.links = [
      { id: 'b', title: 'A dup', url: 'https://www.a.com', icon: { kind: 'letter' }, folderId: null, category: '', createdAt: 2 },
      { id: 'c', title: 'C', url: 'https://c.com', icon: { kind: 'letter' }, folderId: null, category: '', createdAt: 3 },
    ];
    await importBackup(backup, { mode: 'merge', includeSettings: false });
    expect((await dashboardRepo.getQuickLinks())?.links.map((l) => l.id)).toEqual(['a', 'c']);
  });
});
