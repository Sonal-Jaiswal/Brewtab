import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  ArrowUpRight,
  Circle,
  ClipboardCopy,
  Crop,
  Download,
  Droplets,
  Highlighter,
  MousePointer2,
  Redo2,
  Scaling,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CaptureRecord, Settings } from '@/shared/types';
import { uid, downloadBlob, timestampForFile } from '@/shared/utils';
import { Button, IconButton, Input, cx } from '@/shared/components/ui';
import { Modal, useToast } from '@/shared/components/overlay';
import { createDoc, createHistory, hitTest, moveShape, normalizeRect, outputSize, reducer, shapeBounds, type Rect, type Shape, type ShapeType } from './state';
import { drawShape, exportDoc, renderDoc } from './render';

type Tool = 'select' | 'crop' | ShapeType;

const TOOLS: { id: Tool; label: string; icon: LucideIcon; key: string }[] = [
  { id: 'select', label: 'Select & move', icon: MousePointer2, key: 'v' },
  { id: 'crop', label: 'Crop', icon: Crop, key: 'c' },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight, key: 'a' },
  { id: 'rect', label: 'Rectangle', icon: Square, key: 'r' },
  { id: 'ellipse', label: 'Circle', icon: Circle, key: 'e' },
  { id: 'text', label: 'Text', icon: Type, key: 't' },
  { id: 'highlight', label: 'Highlight', icon: Highlighter, key: 'h' },
  { id: 'blur', label: 'Blur (pixelate)', icon: Droplets, key: 'b' },
];

const COLORS = ['#e5484d', '#f5a524', '#30a46c', '#0090ff', '#8e4ec6', '#111111', '#ffffff'];
const HIGHLIGHT = '#ffe14d';

interface Props {
  capture: CaptureRecord;
  bitmap: ImageBitmap;
  settings: Settings;
  onClose: () => void;
}

export function Editor({ capture, bitmap, settings, onClose }: Props) {
  const toast = useToast();
  const [history, dispatch] = useReducer(reducer, null, () => createHistory(createDoc(bitmap.width, bitmap.height, capture.crop)));
  const doc = history.present;
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]);
  const [stroke, setStroke] = useState(Math.max(3, Math.round(bitmap.width / 400)));
  const [draft, setDraft] = useState<Shape | null>(null);
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<OffscreenCanvas | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  // Render committed document into an offscreen cache only when it changes.
  useEffect(() => {
    const c = new OffscreenCanvas(doc.crop.w, doc.crop.h);
    renderDoc(c.getContext('2d')!, bitmap, doc, doc.shapes.filter((s) => !(dragOffset && s.id === selected)));
    base.current = c;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, bitmap, dragOffset !== null, selected]);

  const paint = useCallback(() => {
    const el = canvas.current;
    const cache = base.current;
    if (!el || !cache) return;
    if (el.width !== cache.width || el.height !== cache.height) {
      el.width = cache.width;
      el.height = cache.height;
    }
    const ctx = el.getContext('2d')!;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(cache, 0, 0);
    ctx.save();
    ctx.translate(-doc.crop.x, -doc.crop.y);
    const sel = selected ? doc.shapes.find((s) => s.id === selected) : null;
    if (sel && dragOffset) drawShape(ctx, { ...sel, ...moveShape(sel, dragOffset.dx, dragOffset.dy) } as Shape, doc.crop);
    if (draft) drawShape(ctx, draft, doc.crop);
    if (sel) {
      const moved = dragOffset ? ({ ...sel, ...moveShape(sel, dragOffset.dx, dragOffset.dy) } as Shape) : sel;
      outline(ctx, moved, doc.crop.w);
    }
    ctx.restore();
    if (cropDraft) {
      const r = normalizeRect(cropDraft);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath();
      ctx.rect(0, 0, el.width, el.height);
      ctx.rect(r.x - doc.crop.x, r.y - doc.crop.y, r.w, r.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, el.width / 600);
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(r.x - doc.crop.x, r.y - doc.crop.y, r.w, r.h);
      ctx.restore();
    }
  }, [doc, draft, cropDraft, selected, dragOffset]);

  useEffect(paint, [paint]);

  /** Convert a pointer position to original-image coordinates. */
  const toImage = (e: { clientX: number; clientY: number }) => {
    const el = canvas.current!;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * el.width + doc.crop.x, y: ((e.clientY - r.top) / r.height) * el.height + doc.crop.y };
  };

  function onDown(e: RPointerEvent<HTMLCanvasElement>) {
    if (textInput) return commitText();
    const p = toImage(e);
    if (tool !== 'text') e.currentTarget.setPointerCapture(e.pointerId);
    start.current = p;
    if (tool === 'select') {
      const hit = hitTest(doc.shapes, p.x, p.y, stroke * 2);
      setSelected(hit?.id ?? null);
      if (hit) setDragOffset({ dx: 0, dy: 0 });
      return;
    }
    setSelected(null);
    if (tool === 'text') {
      // Stop the browser's default mousedown focus change from blurring the new text box.
      e.preventDefault();
      start.current = null;
      setTextInput({ x: p.x, y: p.y, value: '' });
      return;
    }
    if (tool === 'crop') return setCropDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    const id = uid('s_');
    const c = tool === 'highlight' ? HIGHLIGHT : color;
    setDraft(tool === 'arrow' ? { id, type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: c, stroke } : ({ id, type: tool, x: p.x, y: p.y, w: 0, h: 0, color: c, stroke } as Shape));
  }

  function onMove(e: RPointerEvent<HTMLCanvasElement>) {
    const s = start.current;
    if (!s) return;
    const p = toImage(e);
    if (tool === 'select' && dragOffset) return setDragOffset({ dx: p.x - s.x, dy: p.y - s.y });
    if (tool === 'crop') return setCropDraft({ x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y });
    setDraft((d) => {
      if (!d) return d;
      if (d.type === 'arrow') return { ...d, x2: p.x, y2: p.y };
      if (d.type === 'text') return d;
      let w = p.x - s.x;
      let h = p.y - s.y;
      if (e.shiftKey && (d.type === 'rect' || d.type === 'ellipse')) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }
      return { ...d, ...normalizeRect({ x: s.x, y: s.y, w, h }) };
    });
  }

  function onUp() {
    if (!start.current) return;
    start.current = null;
    if (tool === 'select' && dragOffset && selected) {
      const sel = doc.shapes.find((s) => s.id === selected);
      if (sel && (dragOffset.dx || dragOffset.dy)) dispatch({ type: 'update', id: selected, patch: moveShape(sel, dragOffset.dx, dragOffset.dy) });
      setDragOffset(null);
      return;
    }
    if (tool === 'crop' && cropDraft) {
      dispatch({ type: 'crop', rect: cropDraft });
      setCropDraft(null);
      return;
    }
    if (draft) dispatch({ type: 'add', shape: draft });
    setDraft(null);
  }

  function commitText() {
    if (textInput?.value.trim()) {
      dispatch({ type: 'add', shape: { id: uid('s_'), type: 'text', x: textInput.x, y: textInput.y, text: textInput.value, size: Math.max(18, stroke * 6), color, stroke: 0 } });
    }
    setTextInput(null);
  }

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || document.querySelector('[role=dialog]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        e.preventDefault();
        void copy();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        dispatch({ type: 'remove', id: selected });
        setSelected(null);
      } else if (e.key === 'Escape') {
        setSelected(null);
        setCropDraft(null);
      } else if (!mod && !e.altKey) {
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const render = async (type: 'image/png' | 'image/jpeg') => exportDoc(bitmap, doc, type, settings.snappage.jpegQuality);

  async function save(format: 'png' | 'jpeg') {
    setBusy(true);
    try {
      const blob = await render(format === 'png' ? 'image/png' : 'image/jpeg');
      downloadBlob(blob, `snappage_${timestampForFile(new Date(capture.createdAt))}.${format === 'png' ? 'png' : 'jpg'}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    setBusy(true);
    try {
      if (!('ClipboardItem' in window)) throw new Error('Copying images isn’t supported here');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': render('image/png') })]);
      toast('Copied to clipboard', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Copy failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  const out = outputSize(doc);
  const textPos = useMemo(() => {
    if (!textInput || !canvas.current) return null;
    const r = canvas.current.getBoundingClientRect();
    const k = r.width / canvas.current.width;
    return { left: (textInput.x - doc.crop.x) * k, top: (textInput.y - doc.crop.y) * k, fontSize: Math.max(18, stroke * 6) * k };
  }, [textInput, doc.crop, stroke]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-[var(--bt-surface-solid)] px-4 py-2">
        <IconButton icon={X} label="Back to library" onClick={onClose} />
        <div className="mr-2 min-w-0">
          <div className="max-w-[260px] truncate text-[13px] font-medium" title={capture.title}>
            {capture.title || 'Screenshot'}
          </div>
          <div className="bt-tabular text-[11.5px] text-muted">
            {out.width} × {out.height}px
          </div>
        </div>
        <div className="flex items-center gap-0.5 rounded-ctl border border-line p-0.5" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <IconButton key={t.id} icon={t.icon} label={`${t.label} (${t.key.toUpperCase()})`} active={tool === t.id} onClick={() => setTool(t.id)} aria-pressed={tool === t.id} />
          ))}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => {
                setColor(c);
                if (selected) dispatch({ type: 'update', id: selected, patch: { color: c } });
              }}
              className={cx('h-6 w-6 rounded-full border border-black/15', color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--bt-surface-solid)]')}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Size
          <input type="range" min={1} max={24} value={stroke} onChange={(e) => setStroke(Number(e.target.value))} aria-label="Stroke size" className="w-20 accent-[var(--bt-accent)]" />
        </label>
        <div className="flex items-center">
          <IconButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} />
          <IconButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} />
          {selected && (
            <IconButton
              icon={Trash2}
              label="Delete selected"
              onClick={() => {
                dispatch({ type: 'remove', id: selected });
                setSelected(null);
              }}
            />
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {(doc.crop.w !== doc.width || doc.crop.h !== doc.height) && (
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'resetCrop' })}>
              Reset crop
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={Scaling} onClick={() => setResizeOpen(true)}>
            Resize
          </Button>
          <Button size="sm" icon={ClipboardCopy} onClick={() => void copy()} disabled={busy}>
            Copy
          </Button>
          <Button size="sm" onClick={() => void save(settings.snappage.defaultFormat === 'png' ? 'jpeg' : 'png')} disabled={busy}>
            {settings.snappage.defaultFormat === 'png' ? 'JPEG' : 'PNG'}
          </Button>
          <Button size="sm" variant="primary" icon={Download} onClick={() => void save(settings.snappage.defaultFormat)} disabled={busy}>
            Save {settings.snappage.defaultFormat.toUpperCase()}
          </Button>
        </div>
      </header>

      {capture.note && <div className="border-b border-line bg-accent-soft px-4 py-1.5 text-[12.5px] text-accent">{capture.note}</div>}

      <div className="min-h-0 flex-1 overflow-auto p-6" style={{ background: 'repeating-conic-gradient(var(--bt-subtle) 0 25%, transparent 0 50%) 0 0/20px 20px' }}>
        <div className="relative mx-auto w-fit max-w-full shadow-card">
          <canvas
            ref={canvas}
            data-testid="editor-canvas"
            aria-label="Screenshot editor canvas"
            className={cx('block h-auto max-w-full touch-none', tool === 'select' ? 'cursor-default' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair')}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {textInput && textPos && (
            <textarea
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitText();
                }
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={commitText}
              aria-label="Annotation text"
              placeholder="Type, then Enter"
              rows={1}
              className="absolute min-w-[8ch] resize-none border border-dashed border-accent bg-black/10 p-0 leading-[1.25] font-semibold outline-none"
              style={{ left: textPos.left, top: textPos.top, fontSize: textPos.fontSize, color }}
            />
          )}
        </div>
      </div>
      <ResizeDialog open={resizeOpen} width={out.width} height={out.height} onClose={() => setResizeOpen(false)} onApply={(w) => (dispatch({ type: 'resize', width: w }), setResizeOpen(false))} cropWidth={doc.crop.w} />
    </div>
  );
}

function outline(ctx: CanvasRenderingContext2D, s: Shape, canvasWidth: number) {
  const b = shapeBounds(s);
  const pad = Math.max(4, canvasWidth / 300);
  ctx.save();
  ctx.strokeStyle = '#0090ff';
  ctx.lineWidth = Math.max(1, canvasWidth / 800);
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
  ctx.restore();
}

function ResizeDialog({ open, width, height, cropWidth, onClose, onApply }: { open: boolean; width: number; height: number; cropWidth: number; onClose: () => void; onApply: (w: number) => void }) {
  const [w, setW] = useState(width);
  useLayoutEffect(() => setW(width), [width, open]);
  const h = Math.round((w / width) * height);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resize image"
      width="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onApply(cropWidth)}>
            Original size
          </Button>
          <Button variant="primary" disabled={w < 16 || w > cropWidth * 4} onClick={() => onApply(w)}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex items-end gap-3">
        <label className="flex-1 space-y-1 text-[13px]">
          <span>Width (px)</span>
          <Input type="number" data-autofocus min={16} max={cropWidth * 4} value={w} onChange={(e) => setW(Math.round(Number(e.target.value)))} />
        </label>
        <span className="pb-2 text-muted">×</span>
        <label className="flex-1 space-y-1 text-[13px]">
          <span>Height (px)</span>
          <Input type="number" value={h} readOnly aria-readonly className="opacity-70" />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">Aspect ratio is kept. Export uses high-quality resampling.</p>
      <div className="mt-3 flex gap-1.5">
        {[0.25, 0.5, 0.75].map((f) => (
          <Button key={f} size="sm" variant="ghost" onClick={() => setW(Math.round(cropWidth * f))}>
            {f * 100}%
          </Button>
        ))}
      </div>
    </Modal>
  );
}

