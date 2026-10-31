import type { LinkIcon } from '@/shared/types';

/** Deterministic, offline icon: no favicon requests leave the device. */
export function LinkAvatar({ title, url, icon, size = 40 }: { title: string; url: string; icon: LinkIcon; size?: number }) {
  const radius = Math.round(size * 0.3);
  if (icon.kind === 'image') {
    return <img src={icon.dataUrl} alt="" width={size} height={size} className="shrink-0 object-cover" style={{ borderRadius: radius }} />;
  }
  if (icon.kind === 'emoji') {
    return (
      <span aria-hidden className="grid shrink-0 place-items-center bg-subtle" style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.5 }}>
        {icon.value}
      </span>
    );
  }
  const hue = hueFor(url);
  const letter = (title.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.42,
        background: `linear-gradient(140deg, hsl(${hue} 62% 58%), hsl(${(hue + 28) % 360} 58% 44%))`,
        textShadow: '0 1px 1px rgb(0 0 0 / 0.15)',
      }}
    >
      {letter}
    </span>
  );
}

export function hueFor(s: string): number {
  let host = s;
  try {
    host = new URL(s).hostname.replace(/^www\./, '');
  } catch {
    /* not a URL */
  }
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Shrink an uploaded icon to a small PNG data URL. */
export async function iconFromFile(file: File, size = 96): Promise<string> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(size / bmp.width, size / bmp.height);
  const w = bmp.width * scale;
  const h = bmp.height * scale;
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  bmp.close();
  return canvas.toDataURL('image/png');
}
