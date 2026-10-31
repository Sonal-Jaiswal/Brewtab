// Pure dashboard layout operations (tested in isolation).
import type { WidgetInstance, WidgetSize, WidgetType } from '@/shared/types';
import { isPlainObject, uid } from '@/shared/utils';

export const WIDGET_TYPES: WidgetType[] = ['tasks', 'notes', 'focus', 'usage', 'bookmarks', 'quote'];

export const DEFAULT_SIZES: Record<WidgetType, WidgetSize> = {
  tasks: { w: 1, h: 3 },
  notes: { w: 1, h: 3 },
  focus: { w: 1, h: 3 },
  usage: { w: 1, h: 3 },
  bookmarks: { w: 1, h: 3 },
  quote: { w: 2, h: 2 },
};

export function createInstance(type: WidgetType, size: WidgetSize = DEFAULT_SIZES[type]): WidgetInstance {
  return { id: uid('w_'), type, size: { ...size }, settings: {} };
}

export function defaultLayout(): WidgetInstance[] {
  // The quote spans the full row under the three tall widgets.
  return [createInstance('tasks'), createInstance('focus'), createInstance('notes'), createInstance('quote', { w: 3, h: 2 })];
}

export function addWidget(layout: WidgetInstance[], type: WidgetType): WidgetInstance[] {
  return [...layout, createInstance(type)];
}

export function removeWidget(layout: WidgetInstance[], id: string): WidgetInstance[] {
  return layout.filter((w) => w.id !== id);
}

export function moveWidget(layout: WidgetInstance[], fromId: string, toId: string): WidgetInstance[] {
  const from = layout.findIndex((w) => w.id === fromId);
  const to = layout.findIndex((w) => w.id === toId);
  if (from < 0 || to < 0 || from === to) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function resizeWidget(layout: WidgetInstance[], id: string, size: WidgetSize): WidgetInstance[] {
  return layout.map((w) => (w.id === id ? { ...w, size: clampSize(size) } : w));
}

export function updateWidgetSettings(layout: WidgetInstance[], id: string, patch: Record<string, unknown>): WidgetInstance[] {
  return layout.map((w) => (w.id === id ? { ...w, settings: { ...w.settings, ...patch } } : w));
}

function clampSize(s: Partial<WidgetSize>): WidgetSize {
  const w = Math.min(3, Math.max(1, Math.round(Number(s.w) || 1))) as WidgetSize['w'];
  const h = Math.min(4, Math.max(2, Math.round(Number(s.h) || 3))) as WidgetSize['h'];
  return { w, h };
}

/** Repair layouts read from storage or an import: unknown types and duplicate IDs are dropped. */
export function normalizeLayout(raw: unknown): WidgetInstance[] {
  if (!Array.isArray(raw)) return defaultLayout();
  const seen = new Set<string>();
  const out: WidgetInstance[] = [];
  for (const item of raw) {
    if (!isPlainObject(item) || !WIDGET_TYPES.includes(item.type as WidgetType)) continue;
    const id = typeof item.id === 'string' && !seen.has(item.id) ? item.id : uid('w_');
    seen.add(id);
    out.push({
      id,
      type: item.type as WidgetType,
      size: clampSize(isPlainObject(item.size) ? (item.size as Partial<WidgetSize>) : DEFAULT_SIZES[item.type as WidgetType]),
      settings: isPlainObject(item.settings) ? item.settings : {},
    });
  }
  return out;
}

export const SIZE_PRESETS: { label: string; size: WidgetSize }[] = [
  { label: 'Small', size: { w: 1, h: 2 } },
  { label: 'Tall', size: { w: 1, h: 3 } },
  { label: 'Extra tall', size: { w: 1, h: 4 } },
  { label: 'Wide', size: { w: 2, h: 2 } },
  { label: 'Wide & tall', size: { w: 2, h: 3 } },
  { label: 'Full width', size: { w: 3, h: 2 } },
  { label: 'Full & tall', size: { w: 3, h: 3 } },
];
