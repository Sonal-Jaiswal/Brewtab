// Canvas rendering for the SnapPage editor and export.
import type { BoxShape, Doc, Shape } from './state';
import { outputSize, normalizeRect } from './state';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Source = CanvasImageSource & { width: number; height: number };

/** Draw the cropped image plus all shapes. Coordinates are in image pixels. */
export function renderDoc(ctx: Ctx, source: Source, doc: Doc, shapes: Shape[] = doc.shapes): void {
  const { crop } = doc;
  ctx.save();
  ctx.clearRect(0, 0, crop.w, crop.h);
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  ctx.translate(-crop.x, -crop.y);
  for (const s of shapes) drawShape(ctx, s, crop);
  ctx.restore();
}

export function drawShape(ctx: Ctx, s: Shape, crop = { x: 0, y: 0 }): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.stroke;
  switch (s.type) {
    case 'rect': {
      const r = normalizeRect(s);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      break;
    }
    case 'ellipse': {
      const r = normalizeRect(s);
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'highlight': {
      const r = normalizeRect(s);
      ctx.globalAlpha = 0.38;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      break;
    }
    case 'blur':
      pixelate(ctx, s, crop);
      break;
    case 'arrow': {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = Math.max(12, s.stroke * 4);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2 - Math.cos(angle) * head * 0.6, s.y2 - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(angle - Math.PI / 7), s.y2 - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(s.x2 - head * Math.cos(angle + Math.PI / 7), s.y2 - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'text': {
      ctx.font = `600 ${s.size}px "Inter Variable", system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(2, s.size / 7);
      ctx.strokeStyle = isLight(s.color) ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)';
      s.text.split('\n').forEach((line, i) => {
        const y = s.y + i * s.size * 1.25;
        ctx.strokeText(line, s.x, y);
        ctx.fillText(line, s.x, y);
      });
      break;
    }
  }
  ctx.restore();
}

/** Irreversibly obscure a region by pixelating what's already drawn there. */
function pixelate(ctx: Ctx, s: BoxShape, crop: { x: number; y: number }): void {
  const r = normalizeRect(s);
  // Work in canvas (device) space: undo the translate for get/putImageData.
  const dx = Math.round(r.x - crop.x);
  const dy = Math.round(r.y - crop.y);
  const w = Math.round(r.w);
  const h = Math.round(r.h);
  if (w < 1 || h < 1) return;
  const block = Math.max(6, Math.round(Math.min(w, h) / 12));
  const small = new OffscreenCanvas(Math.max(1, Math.ceil(w / block)), Math.max(1, Math.ceil(h / block)));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(ctx.canvas as CanvasImageSource, dx, dy, w, h, 0, 0, small.width, small.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, dx, dy, w, h);
  ctx.restore();
}

function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/** Render at output size and encode. Runs on an OffscreenCanvas so the UI stays responsive. */
export async function exportDoc(source: Source, doc: Doc, type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Blob> {
  const full = new OffscreenCanvas(doc.crop.w, doc.crop.h);
  const fctx = full.getContext('2d')!;
  if (type === 'image/jpeg') {
    fctx.fillStyle = '#fff';
    fctx.fillRect(0, 0, full.width, full.height);
  }
  renderDoc(fctx, source, doc);
  const { width, height } = outputSize(doc);
  if (width === full.width && height === full.height) return full.convertToBlob({ type, quality });
  const out = new OffscreenCanvas(width, height);
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(full, 0, 0, width, height);
  return out.convertToBlob({ type, quality });
}
