// Widget registry. To add a widget: create a component that accepts
// WidgetProps, then add one entry here — the dashboard picks it up automatically.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { BarChart3, Bookmark, CheckSquare, Quote, StickyNote, Timer, type LucideIcon } from 'lucide-react';
import type { ModuleId, Settings, WidgetInstance, WidgetType } from '@/shared/types';

export const MODULE_NAMES: Record<ModuleId, string> = { scrollstop: 'ScrollStop' };

export interface WidgetProps {
  instance: WidgetInstance;
  settings: Settings;
  /** Persist widget-specific settings. */
  setWidgetSettings: (patch: Record<string, unknown>) => void;
}

export interface WidgetSettingField {
  key: string;
  label: string;
  type: 'toggle' | 'select' | 'number';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  default: unknown;
}

export interface WidgetDefinition {
  type: WidgetType;
  title: string;
  description: string;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType<WidgetProps>>;
  /** Only shown when this module is enabled. */
  module?: ModuleId;
  /** Declarative settings rendered by the generic widget settings dialog. */
  settings?: WidgetSettingField[];
  /** Allow more than one instance on the dashboard. */
  multiple?: boolean;
}

export const WIDGETS: Record<WidgetType, WidgetDefinition> = {
  tasks: {
    type: 'tasks',
    title: 'Tasks',
    description: 'Today’s to-dos with due dates, priorities and categories.',
    icon: CheckSquare,
    component: lazy(() => import('./TasksWidget')),
    settings: [
      {
        key: 'defaultView',
        label: 'Default view',
        type: 'select',
        default: 'today',
        options: [
          { value: 'today', label: 'Today' },
          { value: 'all', label: 'All open' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'done', label: 'Completed' },
        ],
      },
    ],
  },
  notes: {
    type: 'notes',
    title: 'Notes',
    description: 'Quick notes with search, pinning and autosave.',
    icon: StickyNote,
    component: lazy(() => import('./NotesWidget')),
  },
  focus: {
    type: 'focus',
    title: 'Focus',
    description: 'Start a focus session and see today’s focus time.',
    icon: Timer,
    module: 'scrollstop',
    component: lazy(() => import('./FocusWidget')),
  },
  usage: {
    type: 'usage',
    title: 'Screen time',
    description: 'Where your browsing time went today and this week.',
    icon: BarChart3,
    module: 'scrollstop',
    component: lazy(() => import('./UsageWidget')),
    settings: [{ key: 'count', label: 'Sites to show', type: 'number', min: 3, max: 10, default: 5 }],
  },
  bookmarks: {
    type: 'bookmarks',
    title: 'Bookmarks',
    description: 'Browse your Chrome bookmark folders (needs permission).',
    icon: Bookmark,
    component: lazy(() => import('./BookmarksWidget')),
    multiple: true,
  },
  quote: {
    type: 'quote',
    title: 'Daily quote',
    description: 'A short quote that changes every day.',
    icon: Quote,
    component: lazy(() => import('./QuoteWidget')),
    settings: [{ key: 'showAuthor', label: 'Show author', type: 'toggle', default: true }],
  },
};

export function widgetSetting<T>(instance: WidgetInstance, def: WidgetDefinition, key: string): T {
  const field = def.settings?.find((f) => f.key === key);
  return (instance.settings[key] ?? field?.default) as T;
}
