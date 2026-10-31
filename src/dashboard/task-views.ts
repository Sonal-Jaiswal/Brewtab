import type { Note, Priority, Task } from '@/shared/types';
import { dayKey } from '@/shared/utils';

export type TaskView = 'today' | 'all' | 'overdue' | 'done';

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function isOverdue(t: Task, today = dayKey()): boolean {
  return !t.done && t.due !== null && t.due < today;
}

export function filterTasks(tasks: Task[], view: TaskView, category: string | null, today = dayKey()): Task[] {
  let list = tasks;
  if (category) list = list.filter((t) => t.category === category);
  switch (view) {
    case 'today':
      // Due today, overdue, or undated open tasks.
      list = list.filter((t) => !t.done && (t.due === null || t.due <= today));
      break;
    case 'all':
      list = list.filter((t) => !t.done);
      break;
    case 'overdue':
      list = list.filter((t) => isOverdue(t, today));
      break;
    case 'done':
      return list.filter((t) => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  }
  return [...list].sort(
    (a, b) =>
      Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      a.createdAt - b.createdAt,
  );
}

export function taskCounts(tasks: Task[], today = dayKey()) {
  return {
    today: filterTasks(tasks, 'today', null, today).length,
    all: tasks.filter((t) => !t.done).length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    done: tasks.filter((t) => t.done).length,
  };
}

export function categoriesOf(tasks: Task[]): string[] {
  return [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function formatDue(due: string, today = dayKey()): string {
  if (due === today) return 'Today';
  const d = new Date(`${due}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff}d overdue`;
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- Notes ----------

export function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  const list = q ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)) : notes;
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export function noteTitle(n: Note): string {
  return n.title.trim() || n.body.trim().split('\n')[0].slice(0, 60) || 'Untitled note';
}

export function notesToMarkdown(notes: Note[]): string {
  return searchNotes(notes, '')
    .map((n) => `# ${noteTitle(n)}\n\n_Created ${new Date(n.createdAt).toLocaleString()} · Updated ${new Date(n.updatedAt).toLocaleString()}_\n\n${n.body}\n`)
    .join('\n---\n\n');
}
