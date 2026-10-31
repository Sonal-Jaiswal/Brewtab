import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, Component, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Maximize2, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import type { Settings, WidgetInstance, WidgetType } from '@/shared/types';
import { dashboardRepo } from '@/storage/indexeddb/repos';
import { onDataChange } from '@/shared/broadcast';
import { Button, IconButton, Input, Select, Toggle, cx } from '@/shared/components/ui';
import { Menu, Modal, useConfirm } from '@/shared/components/overlay';
import { MODULE_NAMES, WIDGETS, widgetSetting, type WidgetDefinition } from '../widgets/registry';
import { SIZE_PRESETS, WIDGET_TYPES, addWidget, defaultLayout, moveWidget, normalizeLayout, removeWidget, resizeWidget, updateWidgetSettings } from '../layout';

export function useLayout() {
  const [layout, setLayout] = useState<WidgetInstance[] | null>(null);
  const load = useCallback(() => {
    void dashboardRepo.getLayout().then(
      (doc) => setLayout(doc ? normalizeLayout(doc.widgets) : defaultLayout()),
      () => setLayout(defaultLayout()),
    );
  }, []);
  useEffect(() => {
    load();
    return onDataChange((t) => (t === 'dashboard' || t === 'all') && load());
  }, [load]);
  const save = useCallback((next: WidgetInstance[]) => {
    setLayout(next);
    void dashboardRepo.saveLayout(next);
  }, []);
  return [layout, save] as const;
}

const W_CLASS = { 1: 'col-span-1', 2: 'col-span-1 md:col-span-2', 3: 'col-span-1 md:col-span-2 xl:col-span-3' } as const;

export function WidgetGrid({ settings, editMode, onExitEdit }: { settings: Settings; editMode: boolean; onExitEdit: () => void }) {
  const [layout, save] = useLayout();
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState<WidgetInstance | null>(null);
  const confirm = useConfirm();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (!layout) return null;
  const visible = layout.filter((w) => !WIDGETS[w.type].module || settings.modules[WIDGETS[w.type].module!]);

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) save(moveWidget(layout, String(e.active.id), String(e.over.id)));
  };

  return (
    <section aria-label="Widgets" className="mx-auto w-full max-w-[1180px]">
      {editMode && (
        <div className="bt-card bt-enter mb-[var(--bt-gap)] flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
          <span className="mr-auto text-muted">Drag widgets to reorder. Use the size and settings buttons on each widget.</span>
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
            Add widget
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            onClick={async () => {
              if (await confirm({ title: 'Reset layout?', message: 'Widgets go back to the default arrangement. Your tasks and notes are not affected.', confirmLabel: 'Reset' })) save(defaultLayout());
            }}
          >
            Reset
          </Button>
          <Button size="sm" variant="primary" icon={Check} onClick={onExitEdit}>
            Done
          </Button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy} disabled={!editMode}>
          <div className="grid auto-rows-[150px] grid-flow-row-dense grid-cols-1 gap-[var(--bt-gap)] md:grid-cols-2 xl:grid-cols-3" data-testid="widget-grid">
            {visible.map((w) => (
              <WidgetFrame
                key={w.id}
                instance={w}
                settings={settings}
                editMode={editMode}
                onRemove={() => save(removeWidget(layout, w.id))}
                onResize={(size) => save(resizeWidget(layout, w.id, size))}
                onConfigure={() => setConfiguring(w)}
                onSettings={(patch) => save(updateWidgetSettings(layout, w.id, patch))}
              />
            ))}
            {visible.length === 0 && (
              <div className="bt-card col-span-full row-span-2 grid place-items-center p-6 text-center">
                <div>
                  <p className="font-medium">Your dashboard is clear</p>
                  <p className="mt-1 text-sm text-muted">Add widgets for tasks, notes, focus and more.</p>
                  <Button className="mt-3" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                    Add a widget
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <AddWidgetDialog
        open={adding}
        settings={settings}
        layout={layout}
        onClose={() => setAdding(false)}
        onAdd={(type) => {
          save(addWidget(layout, type));
          setAdding(false);
        }}
      />
      <WidgetSettingsDialog
        instance={configuring}
        onClose={() => setConfiguring(null)}
        onSave={(patch) => {
          if (configuring) save(updateWidgetSettings(layout, configuring.id, patch));
          setConfiguring(null);
        }}
      />
    </section>
  );
}

function WidgetFrame({
  instance,
  settings,
  editMode,
  onRemove,
  onResize,
  onConfigure,
  onSettings,
}: {
  instance: WidgetInstance;
  settings: Settings;
  editMode: boolean;
  onRemove: () => void;
  onResize: (size: WidgetInstance['size']) => void;
  onConfigure: () => void;
  onSettings: (patch: Record<string, unknown>) => void;
}) {
  const def = WIDGETS[instance.type];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id, disabled: !editMode });
  const [sizeMenu, setSizeMenu] = useState(false);
  const sizeBtn = useRef<HTMLButtonElement>(null);
  const Widget = def.component;

  return (
    <article
      ref={setNodeRef}
      aria-label={def.title}
      data-widget={instance.type}
      style={{ transform: CSS.Transform.toString(transform), transition, gridRow: `span ${instance.size.h}` }}
      className={cx('bt-card relative flex min-h-0 flex-col p-4', W_CLASS[instance.size.w], isDragging && 'z-20 opacity-90 ring-2 ring-accent', editMode && 'ring-1 ring-line')}
    >
      <header className="mb-2.5 flex items-center gap-2">
        {editMode && (
          <button {...attributes} {...listeners} aria-label={`Move ${def.title} widget`} className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted hover:text-fg active:cursor-grabbing">
            <GripVertical size={16} aria-hidden />
          </button>
        )}
        <def.icon size={15} className="text-accent" aria-hidden />
        <h2 className="text-[13px] font-semibold tracking-wide">{def.title}</h2>
        {editMode && (
          <div className="ml-auto flex items-center">
            <IconButton ref={sizeBtn} icon={Maximize2} label="Resize widget" size="sm" onClick={() => setSizeMenu(true)} />
            {def.settings && <IconButton icon={Settings2} label="Widget settings" size="sm" onClick={onConfigure} />}
            <IconButton icon={Trash2} label="Remove widget" size="sm" onClick={onRemove} />
          </div>
        )}
      </header>
      <div className={cx('min-h-0 flex-1', editMode && 'pointer-events-none opacity-60 select-none')}>
        <WidgetBoundary name={def.title}>
          <Suspense fallback={<div className="h-full animate-pulse rounded-ctl bg-subtle" />}>
            <Widget instance={instance} settings={settings} setWidgetSettings={onSettings} />
          </Suspense>
        </WidgetBoundary>
      </div>
      {sizeMenu && (
        <Menu
          anchor={sizeBtn.current}
          onClose={() => setSizeMenu(false)}
          items={SIZE_PRESETS.map((p) => ({
            label: p.label,
            icon: p.size.w === instance.size.w && p.size.h === instance.size.h ? Check : undefined,
            onSelect: () => onResize(p.size),
          }))}
        />
      )}
    </article>
  );
}

/** One misbehaving widget must never take down the whole new tab page. */
class WidgetBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center text-center text-[13px] text-muted">
          <div>
            <p>{this.props.name} couldn’t load.</p>
            <button className="mt-1 text-accent hover:underline" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AddWidgetDialog({ open, settings, layout, onClose, onAdd }: { open: boolean; settings: Settings; layout: WidgetInstance[]; onClose: () => void; onAdd: (t: WidgetType) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a widget" width="max-w-xl">
      <ul className="grid gap-2 sm:grid-cols-2">
        {WIDGET_TYPES.map((t) => {
          const def: WidgetDefinition = WIDGETS[t];
          const present = layout.some((w) => w.type === t);
          const moduleOff = def.module && !settings.modules[def.module];
          const disabled = (present && !def.multiple) || !!moduleOff;
          return (
            <li key={t}>
              <button
                disabled={disabled}
                onClick={() => onAdd(t)}
                className="flex w-full items-start gap-3 rounded-card border border-line p-3 text-left transition hover:border-accent hover:bg-subtle disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-transparent"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl bg-accent-soft text-accent">
                  <def.icon size={17} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{def.title}</span>
                  <span className="block text-[12.5px] text-muted">{moduleOff ? `Turn on ${MODULE_NAMES[def.module!]} to use this.` : present && !def.multiple ? 'Already on your dashboard.' : def.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function WidgetSettingsDialog({ instance, onClose, onSave }: { instance: WidgetInstance | null; onClose: () => void; onSave: (patch: Record<string, unknown>) => void }) {
  const def = instance ? WIDGETS[instance.type] : null;
  const [values, setValues] = useState<Record<string, unknown>>({});
  useLayoutEffect(() => {
    if (instance && def) setValues(Object.fromEntries((def.settings ?? []).map((f) => [f.key, widgetSetting(instance, def, f.key)])));
  }, [instance, def]);
  if (!def) return null;
  return (
    <Modal
      open={!!instance}
      onClose={onClose}
      title={`${def.title} settings`}
      width="max-w-sm"
      footer={
        <>
          <Button variant="ghost" icon={X} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(values)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(def.settings ?? []).map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-4">
            <span className="text-sm">{f.label}</span>
            {f.type === 'toggle' && <Toggle label={f.label} checked={Boolean(values[f.key])} onChange={(v) => setValues({ ...values, [f.key]: v })} />}
            {f.type === 'select' && (
              <Select className="!w-40" value={String(values[f.key])} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
            {f.type === 'number' && (
              <Input
                type="number"
                className="!w-24"
                min={f.min}
                max={f.max}
                value={Number(values[f.key])}
                onChange={(e) => setValues({ ...values, [f.key]: Math.min(f.max ?? 99, Math.max(f.min ?? 0, Number(e.target.value))) })}
              />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
