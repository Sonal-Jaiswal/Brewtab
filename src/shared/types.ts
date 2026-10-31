// Core domain types shared by every surface of the extension.

export type ThemeId = 'minimal-light' | 'midnight' | 'nature' | 'glass';
/** 'default' uses the search engine chosen in Chrome's own settings (chrome.search). */
export type SearchProvider = 'default' | 'google' | 'bing' | 'duckduckgo' | 'custom';
export type ModuleId = 'scrollstop' | 'nightshift' | 'snappage';
export type Spacing = 'compact' | 'cozy' | 'roomy';
export type DateFormat = 'long' | 'short' | 'iso' | 'weekday';

export type Background =
  | { kind: 'theme' }
  | { kind: 'color'; color: string }
  | { kind: 'image'; wallpaperId: string };

export interface AppearanceSettings {
  theme: ThemeId;
  background: Background;
  /** 0–1 opacity of the background layer. */
  backgroundOpacity: number;
  /** Background blur in px. */
  backgroundBlur: number;
  /** 0–1 opacity of widget surfaces. */
  widgetOpacity: number;
  /** 'auto' follows the theme, otherwise a hex colour. */
  textColor: 'auto' | string;
  /** Card radius in px. */
  radius: number;
  spacing: Spacing;
  reduceMotion: 'system' | 'on' | 'off';
}

export interface BlockRule {
  id: string;
  kind: 'domain' | 'pattern';
  value: string;
  enabled: boolean;
  createdAt: number;
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** HH:MM, 24h local time */
  start: string;
  end: string;
}

export interface DailyLimit {
  id: string;
  domain: string;
  minutes: number;
  enabled: boolean;
}

export interface FocusConfig {
  workMinutes: number;
  breakMinutes: number;
  cycles: number;
  blockDuringFocus: boolean;
  autoStartBreaks: boolean;
}

export interface ScrollStopSettings {
  alwaysOn: boolean;
  blocklist: BlockRule[];
  allowlist: BlockRule[];
  schedules: Schedule[];
  limits: DailyLimit[];
  focus: FocusConfig;
  trackUsage: boolean;
  blockedMessage: string;
}

export type FontFamilyChoice = 'default' | 'sans' | 'serif' | 'mono' | 'readable';

export interface NightShiftPrefs {
  dark: boolean;
  /** percent, 50–150 */
  brightness: number;
  /** percent, 50–150 */
  contrast: number;
  /** percent, 0–100 */
  sepia: number;
  /** percent, 80–160 */
  fontScale: number;
  fontFamily: FontFamilyChoice;
}

export interface NightShiftSiteOverride {
  disabled?: boolean;
  prefs?: Partial<NightShiftPrefs>;
}

export interface NightShiftSettings {
  /** Quick on/off switch (separate from module enable). */
  active: boolean;
  /** Apply automatically on every site (needs optional site access). */
  autoApply: boolean;
  /** Don't invert pages that are already dark. */
  skipDarkSites: boolean;
  global: NightShiftPrefs;
  sites: Record<string, NightShiftSiteOverride>;
  excluded: string[];
  schedule: { enabled: boolean; start: string; end: string };
}

export interface SnapPageSettings {
  defaultFormat: 'png' | 'jpeg';
  jpegQuality: number;
  keepRecent: number;
}

export interface Settings {
  version: number;
  onboarded: boolean;
  profile: { name: string; customGreeting: string };
  clock: {
    show: boolean;
    format: '12h' | '24h';
    showSeconds: boolean;
    dateFormat: DateFormat;
    secondaryTimezone: string | null;
  };
  search: { show: boolean; provider: SearchProvider; customUrl: string; openInNewTab: boolean };
  quickLinks: { show: boolean };
  appearance: AppearanceSettings;
  modules: Record<ModuleId, boolean>;
  scrollstop: ScrollStopSettings;
  nightshift: NightShiftSettings;
  snappage: SnapPageSettings;
}

// ---------- IndexedDB records ----------

export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  /** YYYY-MM-DD or null */
  due: string | null;
  priority: Priority;
  category: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UsageRecord {
  /** `${date}|${domain}` */
  key: string;
  date: string;
  domain: string;
  seconds: number;
}

export interface FocusRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  plannedMinutes: number;
  focusedMs: number;
  cyclesCompleted: number;
  completed: boolean;
}

export type LinkIcon = { kind: 'letter' } | { kind: 'emoji'; value: string } | { kind: 'image'; dataUrl: string };

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  icon: LinkIcon;
  folderId: string | null;
  category: string;
  createdAt: number;
}

export interface LinkFolder {
  id: string;
  name: string;
}

export interface QuickLinksDoc {
  id: 'quicklinks';
  links: QuickLink[];
  folders: LinkFolder[];
}

export type WidgetType = 'tasks' | 'notes' | 'focus' | 'usage' | 'modules' | 'bookmarks' | 'quote';

export interface WidgetSize {
  /** column span, 1–3 */
  w: 1 | 2 | 3;
  /** row span, 2–4 (rows are ~150px) */
  h: 2 | 3 | 4;
}

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  settings: Record<string, unknown>;
}

export interface LayoutDoc {
  id: 'layout';
  widgets: WidgetInstance[];
  updatedAt: number;
}

export interface CaptureRecord {
  id: string;
  createdAt: number;
  url: string;
  title: string;
  kind: 'visible' | 'region' | 'fullpage' | 'file';
  width: number;
  height: number;
  /** Initial crop in image pixels (region capture). */
  crop: { x: number; y: number; w: number; h: number } | null;
  /** Full-page capture was cut short (page too tall / container scroll). */
  note: string | null;
  blob: Blob;
}

export interface WallpaperRecord {
  id: string;
  createdAt: number;
  blob: Blob;
}

export interface BackupSnapshot {
  id: string;
  createdAt: number;
  reason: string;
  payload: string;
}

// ---------- Runtime state (chrome.storage.local, not user preferences) ----------

export type FocusState =
  | { status: 'idle' }
  | {
      status: 'running' | 'paused';
      phase: 'work' | 'break';
      sessionId: string;
      sessionStartedAt: number;
      cycle: number;
      totalCycles: number;
      phaseDurationMs: number;
      /** running: absolute end timestamp of the current phase */
      endsAt: number;
      /** paused: remaining ms in the current phase */
      remainingMs: number;
      /** focus time banked from completed work phases */
      focusedMs: number;
      plannedMinutes: number;
    };

export interface LimitState {
  date: string;
  domains: string[];
}
