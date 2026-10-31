import { useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, Circle, Flag, MoreHorizontal, Pencil, Plus, Tag, Trash2, ListChecks } from 'lucide-react';
import type { Priority, Task } from '@/shared/types';
import { tasksRepo } from '@/storage/indexeddb/repos';
import { useLiveQuery, useNow } from '@/shared/hooks';
import { Button, EmptyState, Field, IconButton, Input, Select, Textarea, cx } from '@/shared/components/ui';
import { Menu, Modal, useToast } from '@/shared/components/overlay';
import { categoriesOf, filterTasks, formatDue, isOverdue, taskCounts, type TaskView } from '../task-views';
import { dayKey } from '@/shared/utils';
import { WIDGETS, widgetSetting, type WidgetProps } from './registry';

const VIEWS: { id: TaskView; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'done', label: 'Done' },
];

const PRIORITY_COLOR: Record<Priority, string> = { high: 'text-danger', medium: 'text-accent', low: 'text-muted' };

export default function TasksWidget({ instance }: WidgetProps) {
  const toast = useToast();
  const { data: tasks = [] } = useLiveQuery(() => tasksRepo.list(), ['tasks']);
  const [view, setView] = useState<TaskView>(() => widgetSetting<TaskView>(instance, WIDGETS.tasks, 'defaultView'));
  const [category, setCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const now = useNow(60_000);
  const today = dayKey(now);

  const counts = useMemo(() => taskCounts(tasks, today), [tasks, today]);
  const categories = useMemo(() => categoriesOf(tasks), [tasks]);
  const visible = useMemo(() => filterTasks(tasks, view, category, today), [tasks, view, category, today]);

  async function quickAdd(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    try {
      await tasksRepo.create({ title, due: view === 'today' ? today : null, category: category ?? '' });
      setDraft('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add task', 'error');
    }
  }

  async function toggle(t: Task) {
    await tasksRepo.update(t.id, { done: !t.done });
  }

  async function remove(t: Task) {
    await tasksRepo.remove(t.id);
    toast('Task deleted', 'info', { label: 'Undo', run: () => void tasksRepo.restore(t) });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-1" role="tablist" aria-label="Task views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={cx(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              view === v.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-fg',
            )}
          >
            {v.label}
            <span className={cx('bt-tabular', v.id === 'overdue' && counts.overdue > 0 && view !== v.id && 'text-danger')}>{counts[v.id]}</span>
          </button>
        ))}
        {categories.length > 0 && (
          <Select
            aria-label="Filter by category"
            value={category ?? ''}
            onChange={(e) => setCategory(e.target.value || null)}
            className="ml-auto !h-7 !w-auto max-w-28 min-w-0 !px-2 !pr-6 text-xs"
          >
            <option value="">All lists</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </div>

      {view !== 'done' && (
        <form onSubmit={quickAdd} className="mb-2 flex gap-1.5">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task and press Enter" aria-label="New task" className="!h-8 text-[13px]" />
          <IconButton icon={Pencil} label="Add task with details" size="sm" className="h-8 w-8" onClick={() => setEditing('new')} />
        </form>
      )}

      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1" aria-label={`${view} tasks`}>
        {visible.map((t) => (
          <TaskRow key={t.id} task={t} today={today} onToggle={() => void toggle(t)} onEdit={() => setEditing(t)} onDelete={() => void remove(t)} />
        ))}
        {visible.length === 0 && (
          <li>
            <EmptyState icon={view === 'done' ? CheckCircle2 : ListChecks} title={emptyTitle(view)}>
              {view === 'today' ? 'Add one above. Tasks without a date show up here too.' : undefined}
            </EmptyState>
          </li>
        )}
      </ul>
      {view === 'done' && counts.done > 0 && (
        <Button size="sm" variant="ghost" icon={Trash2} className="mt-1 self-end" onClick={async () => toast(`Cleared ${await tasksRepo.clearCompleted()} tasks`, 'success')}>
          Clear completed
        </Button>
      )}

      <TaskEditor task={editing} categories={categories} onClose={() => setEditing(null)} />
    </div>
  );
}

function emptyTitle(view: TaskView): string {
  return { today: 'Nothing due today', all: 'No open tasks', overdue: 'Nothing overdue', done: 'No completed tasks yet' }[view];
}

function TaskRow({ task, today, onToggle, onEdit, onDelete }: { task: Task; today: string; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const overdue = isOverdue(task, today);
  return (
    <li className="group flex items-start gap-2 rounded-ctl px-1.5 py-1.5 hover:bg-subtle">
      <button onClick={onToggle} role="checkbox" aria-checked={task.done} aria-label={`Mark “${task.title}” ${task.done ? 'not done' : 'done'}`} className="mt-px text-muted hover:text-accent">
        {task.done ? <CheckCircle2 size={17} className="text-success" /> : <Circle size={17} />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <div className={cx('text-[13.5px] leading-snug break-words', task.done && 'text-muted line-through')}>{task.title}</div>
        {(task.due || task.category || task.priority !== 'medium') && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
            {task.due && (
              <span className={cx('inline-flex items-center gap-1', overdue && 'font-medium text-danger')}>
                <CalendarDays size={11} aria-hidden />
                {formatDue(task.due, today)}
              </span>
            )}
            {task.priority !== 'medium' && (
              <span className={cx('inline-flex items-center gap-1', PRIORITY_COLOR[task.priority])}>
                <Flag size={11} aria-hidden />
                {task.priority}
              </span>
            )}
            {task.category && (
              <span className="inline-flex items-center gap-1">
                <Tag size={11} aria-hidden />
                {task.category}
              </span>
            )}
          </div>
        )}
      </button>
      <IconButton ref={btn} icon={MoreHorizontal} label="Task actions" size="sm" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => setMenu(true)} />
      {menu && (
        <Menu
          anchor={btn.current}
          onClose={() => setMenu(false)}
          items={[
            { label: 'Edit', icon: Pencil, onSelect: onEdit },
            { label: task.done ? 'Mark not done' : 'Mark done', icon: CheckCircle2, onSelect: onToggle },
            { label: 'Delete', icon: Trash2, onSelect: onDelete, danger: true },
          ]}
        />
      )}
    </li>
  );
}

export function TaskEditor({ task, categories, onClose }: { task: Task | 'new' | null; categories: string[]; onClose: () => void }) {
  const toast = useToast();
  const isNew = task === 'new';
  const initial = task && task !== 'new' ? task : null;
  const [form, setForm] = useState({ title: '', notes: '', due: '', priority: 'medium' as Priority, category: '' });
  const [lastId, setLastId] = useState<string | null | undefined>(undefined);
  const key = task === null ? undefined : (initial?.id ?? null);
  if (key !== lastId) {
    setLastId(key);
    if (task !== null) setForm({ title: initial?.title ?? '', notes: initial?.notes ?? '', due: initial?.due ?? '', priority: initial?.priority ?? 'medium', category: initial?.category ?? '' });
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    try {
      const data = { title: form.title, notes: form.notes, due: form.due || null, priority: form.priority, category: form.category.trim() };
      if (isNew) await tasksRepo.create(data);
      else if (initial) await tasksRepo.update(initial.id, data);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save task', 'error');
    }
  }

  return (
    <Modal
      open={task !== null}
      onClose={onClose}
      title={isNew ? 'New task' : 'Edit task'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => void save()} disabled={!form.title.trim()}>
            {isNew ? 'Add task' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-3.5">
        <Field label="Title">
          <Input data-autofocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs doing?" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Due date">
            <Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          <Field label="Category">
            <Input list="bt-task-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Work" />
            <datalist id="bt-task-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional details" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
