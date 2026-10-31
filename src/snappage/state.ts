// SnapPage editor document: annotations are vector shapes over the original
// capture, so crop/resize/undo are cheap and lossless until export.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ShapeType = 'rect' | 'ellipse' | 'arrow' | 'highlight' | 'blur' | 'text';

interface BaseShape {
  id: string;
  color: string;
  stroke: number;
}
export type BoxShape = BaseShape & { type: 'rect' | 'ellipse' | 'highlight' | 'blur'; x: number; y: number; w: number; h: number };
export type ArrowShape = BaseShape & { type: 'arrow'; x1: number; y1: number; x2: number; y2: number };
export type TextShape = BaseShape & { type: 'text'; x: number; y: number; text: string; size: number };
export type Shape = BoxShape | ArrowShape | TextShape;

export interface Doc {
  width: number;
  height: number;
  shapes: Shape[];
  /** Visible region in original image pixels. */
  crop: Rect;
  /** Output scale applied on export (resize). */
  scale: number;
}

export interface History {
  past: Doc[];
  present: Doc;
  future: Doc[];
}

export const MAX_HISTORY = 100;

export function createDoc(width: number, height: number, crop: Rect | null = null): Doc {
  return { width, height, shapes: [], crop: crop ? clampRect(crop, width, height) : { x: 0, y: 0, w: width, h: height }, scale: 1 };
}

export function createHistory(doc: Doc): History {
  return { past: [], present: doc, future: [] };
}

export type Action =
  | { type: 'add'; shape: Shape }
  | { type: 'update'; id: string; patch: Partial<Shape> }
  | { type: 'remove'; id: string }
  | { type: 'crop'; rect: Rect }
  | { type: 'resetCrop' }
  | { type: 'resize'; width: number }
  | { type: 'undo' }
  | { type: 'redo' };

function commit(h: History, next: Doc): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] };
}

export function reducer(h: History, action: Action): History {
  const d = h.present;
  switch (action.type) {
    case 'undo':
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    case 'redo':
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    case 'add':
      if (isDegenerate(action.shape)) return h;
      return commit(h, { ...d, shapes: [...d.shapes, action.shape] });
    case 'update':
      return commit(h, { ...d, shapes: d.shapes.map((s) => (s.id === action.id ? ({ ...s, ...action.patch } as Shape) : s)) });
    case 'remove':
      return commit(h, { ...d, shapes: d.shapes.filter((s) => s.id !== action.id) });
    case 'crop': {
      const rect = clampRect(normalizeRect(action.rect), d.width, d.height);
      if (rect.w < 4 || rect.h < 4) return h;
      return commit(h, { ...d, crop: rect });
    }
    case 'resetCrop':
      return commit(h, { ...d, crop: { x: 0, y: 0, w: d.width, h: d.height } });
    case 'resize': {
      const scale = Math.max(0.05, Math.min(4, action.width / d.crop.w));
      return commit(h, { ...d, scale });
    }
  }
}

export function normalizeRect(r: Rect): Rect {
  return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
}

export function clampRect(r: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width, Math.round(r.x)));
  const y = Math.max(0, Math.min(height, Math.round(r.y)));
  return { x, y, w: Math.max(0, Math.min(width - x, Math.round(r.w))), h: Math.max(0, Math.min(height - y, Math.round(r.h))) };
}

function isDegenerate(s: Shape): boolean {
  if (s.type === 'text') return !s.text.trim();
  if (s.type === 'arrow') return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 4;
  return Math.abs(s.w) < 3 || Math.abs(s.h) < 3;
}

export function outputSize(d: Doc): { width: number; height: number } {
  return { width: Math.max(1, Math.round(d.crop.w * d.scale)), height: Math.max(1, Math.round(d.crop.h * d.scale)) };
}

/** Bounding box of a shape in image pixels (text width is approximated). */
export function shapeBounds(s: Shape): Rect {
  if (s.type === 'arrow') return normalizeRect({ x: s.x1, y: s.y1, w: s.x2 - s.x1, h: s.y2 - s.y1 });
  if (s.type === 'text') {
    const lines = s.text.split('\n');
    return { x: s.x, y: s.y, w: Math.max(...lines.map((l) => l.length)) * s.size * 0.6, h: lines.length * s.size * 1.25 };
  }
  return normalizeRect(s);
}

export function hitTest(shapes: Shape[], x: number, y: number, tolerance = 6): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const b = shapeBounds(shapes[i]);
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return shapes[i];
  }
  return null;
}

export function moveShape(s: Shape, dx: number, dy: number): Partial<Shape> {
  if (s.type === 'arrow') return { x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  return { x: s.x + dx, y: s.y + dy };
}
