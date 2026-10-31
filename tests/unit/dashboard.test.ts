import { describe, expect, it } from 'vitest';
import { addWidget, defaultLayout, moveWidget, normalizeLayout, removeWidget, resizeWidget, updateWidgetSettings } from '@/dashboard/layout';
import { addFolder, addLink, findDuplicate, importBookmarkFolders, moveLink, removeFolder, updateLink, EMPTY_LINKS } from '@/dashboard/quicklinks';
import { filterTasks, formatDue, searchNotes, taskCounts, notesToMarkdown } from '@/dashboard/task-views';
import { greetingFor, resolveQuery, resolveTarget, formatTime } from '@/dashboard/format';
import { dashboardRepo } from '@/storage/indexeddb/repos';
import { WIDGETS } from '@/dashboard/widgets/registry';
import { DEFAULT_SETTINGS } from '@/storage/chrome-storage/settings';
import type { Note, Task } from '@/shared/types';

describe('widget layout', () => {
  it('adds, removes, reorders, resizes and configures widgets', () => {
    let l = defaultLayout();
    expect(l.map((w) => w.type)).toEqual(['tasks', 'focus', 'notes', 'quote']);
    expect(l[3].size).toEqual({ w: 3, h: 2 });
    l = addWidget(l, 'usage');
    expect(l.at(-1)?.type).toBe('usage');
    l = removeWidget(l, l[3].id);
    expect(l.map((w) => w.type)).toEqual(['tasks', 'focus', 'notes', 'usage']);
    l = moveWidget(l, l[3].id, l[0].id);
    expect(l.map((w) => w.type)).toEqual(['usage', 'tasks', 'focus', 'notes']);
    l = resizeWidget(l, l[0].id, { w: 3, h: 4 });
    expect(l[0].size).toEqual({ w: 3, h: 4 });
    l = updateWidgetSettings(l, l[0].id, { count: 7 });
    expect(l[0].settings).toEqual({ count: 7 });
  });

  it('every widget type is registered', () => {
    for (const w of defaultLayout()) expect(WIDGETS[w.type]).toBeDefined();
  });

  it('repairs invalid layouts', () => {
    const l = normalizeLayout([{ id: 'a', type: 'tasks', size: { w: 9, h: 0 } }, { id: 'a', type: 'notes' }, { type: 'nope' }, 'junk']);
    expect(l.map((w) => w.type)).toEqual(['tasks', 'notes']);
    expect(l[0].size).toEqual({ w: 3, h: 3 });
    expect(l[0].id).not.toBe(l[1].id);
    expect(normalizeLayout('broken').length).toBeGreaterThan(0);
  });

  it('persists layouts in IndexedDB', async () => {
    const l = addWidget(defaultLayout(), 'bookmarks');
    await dashboardRepo.saveLayout(l);
    expect((await dashboardRepo.getLayout())?.widgets).toEqual(l);
  });
});

describe('shortcuts', () => {
  it('adds with validation and default titles', () => {
    const { state, link } = addLink(EMPTY_LINKS, { title: '', url: 'news.ycombinator.com' });
    expect(link.url).toBe('https://news.ycombinator.com/');
    expect(link.title).toBe('Ycombinator');
    expect(state.links).toHaveLength(1);
    expect(() => addLink(EMPTY_LINKS, { title: 'x', url: 'not a url' })).toThrow();
  });

  it('detects duplicates regardless of www, scheme and trailing slash', () => {
    const { state } = addLink(EMPTY_LINKS, { title: 'GH', url: 'https://github.com/' });
    expect(findDuplicate(state, 'http://www.github.com')).toBeDefined();
    expect(findDuplicate(state, 'https://github.com/settings')).toBeUndefined();
  });

  it('edits, reorders and keeps links when a folder is removed', () => {
    let s = addLink(EMPTY_LINKS, { title: 'A', url: 'a.com' }).state;
    s = addLink(s, { title: 'B', url: 'b.com' }).state;
    const f = addFolder(s, 'Work');
    s = updateLink(f.state, s.links[0].id, { folderId: f.folder.id, title: 'Alpha' });
    expect(s.links[0]).toMatchObject({ title: 'Alpha', folderId: f.folder.id });
    s = moveLink(s, s.links[1].id, s.links[0].id);
    expect(s.links.map((l) => l.title)).toEqual(['B', 'Alpha']);
    s = removeFolder(s, f.folder.id);
    expect(s.folders).toEqual([]);
    expect(s.links.every((l) => l.folderId === null)).toBe(true);
  });

  it('imports bookmark folders, flattening and skipping duplicates', () => {
    const start = addLink(EMPTY_LINKS, { title: 'A', url: 'https://a.com' }).state;
    const r = importBookmarkFolders(start, [
      { title: 'Dev', children: [{ title: 'A again', url: 'https://www.a.com/' }, { title: 'MDN', url: 'https://developer.mozilla.org' }, { title: 'Sub', children: [{ title: 'JS', url: 'javascript:alert(1)' }, { title: 'C', url: 'https://c.dev' }] }] },
    ]);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(2);
    expect(r.state.folders.map((f) => f.name)).toEqual(['Dev']);
  });
});

const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(), title: 't', notes: '', done: false, due: null, priority: 'medium', category: '', createdAt: 0, updatedAt: 0, completedAt: null, ...over });

describe('task views', () => {
  const today = '2026-10-31';
  const tasks = [
    task({ title: 'undated' }),
    task({ title: 'today', due: today, priority: 'high' }),
    task({ title: 'late', due: '2026-10-20' }),
    task({ title: 'later', due: '2026-11-05' }),
    task({ title: 'done', done: true, completedAt: 5, category: 'Work' }),
  ];

  it('filters today, all, overdue and completed', () => {
    expect(filterTasks(tasks, 'today', null, today).map((t) => t.title)).toEqual(['late', 'today', 'undated']);
    expect(filterTasks(tasks, 'all', null, today)).toHaveLength(4);
    expect(filterTasks(tasks, 'overdue', null, today).map((t) => t.title)).toEqual(['late']);
    expect(filterTasks(tasks, 'done', 'Work', today).map((t) => t.title)).toEqual(['done']);
    expect(taskCounts(tasks, today)).toEqual({ today: 3, all: 4, overdue: 1, done: 1 });
  });

  it('formats due dates relative to today', () => {
    expect(formatDue(today, today)).toBe('Today');
    expect(formatDue('2026-11-01', today)).toBe('Tomorrow');
    expect(formatDue('2026-10-28', today)).toBe('3d overdue');
  });
});

describe('notes search & export', () => {
  const n = (over: Partial<Note>): Note => ({ id: Math.random().toString(), title: '', body: '', pinned: false, createdAt: 0, updatedAt: 0, ...over });
  it('searches title and body, pinned first', () => {
    const notes = [n({ title: 'Shopping', body: 'oat milk', updatedAt: 3 }), n({ title: 'Ideas', body: 'milkshake bar', pinned: true, updatedAt: 1 }), n({ title: 'Other', updatedAt: 9 })];
    expect(searchNotes(notes, 'MILK').map((x) => x.title)).toEqual(['Ideas', 'Shopping']);
    expect(searchNotes(notes, '').map((x) => x.title)).toEqual(['Ideas', 'Other', 'Shopping']);
    expect(notesToMarkdown(notes)).toContain('# Shopping');
  });
});

describe('greeting, clock and search', () => {
  it('greets by time of day and supports custom greetings', () => {
    expect(greetingFor(new Date(2026, 0, 1, 9), 'Ada', '')).toBe('Good morning, Ada');
    expect(greetingFor(new Date(2026, 0, 1, 15), '', '')).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 0, 1, 23), 'Ada', 'Hey {name}!')).toBe('Hey Ada!');
  });

  it('formats 12h/24h with optional seconds', () => {
    const d = new Date(2026, 0, 1, 15, 4, 9);
    expect(formatTime(d, { ...DEFAULT_SETTINGS.clock, format: '24h' }).time).toMatch(/^15:04$/);
    expect(formatTime(d, { ...DEFAULT_SETTINGS.clock, format: '24h', showSeconds: true }).time).toMatch(/^15:04:09$/);
    const twelve = formatTime(d, { ...DEFAULT_SETTINGS.clock, format: '12h' });
    expect(twelve.time).toMatch(/^3:04$/);
    expect(twelve.period).toMatch(/PM/i);
  });

  it('builds search URLs and detects addresses', () => {
    expect(resolveQuery('cats & dogs', 'google', '')).toBe('https://www.google.com/search?q=cats%20%26%20dogs');
    expect(resolveQuery('cats', 'duckduckgo', '')).toBe('https://duckduckgo.com/?q=cats');
    expect(resolveQuery('cats', 'custom', 'https://s.example/?q=%s')).toBe('https://s.example/?q=cats');
    expect(resolveTarget('cats', 'default', '')).toEqual({ kind: 'chrome-search', text: 'cats' });
    expect(resolveTarget('cats', 'custom', 'bad')).toEqual({ kind: 'chrome-search', text: 'cats' });
    expect(resolveTarget('example.org', 'default', '')).toEqual({ kind: 'url', url: 'https://example.org/' });
    expect(resolveQuery('github.com/anthropics', 'bing', '')).toBe('https://github.com/anthropics');
    expect(resolveQuery('node.js tutorial', 'bing', '')).toBe('https://www.bing.com/search?q=node.js%20tutorial');
    expect(resolveQuery('   ', 'google', '')).toBeNull();
  });
});
