import { useEffect, useState } from 'react';
import type { AppearanceSettings } from '@/shared/types';
import { wallpapersRepo } from '@/storage/indexeddb/repos';

/** Fixed background layer: theme art, a solid colour, or the user's own wallpaper. */
export function Background({ appearance }: { appearance: AppearanceSettings }) {
  const bg = appearance.background;
  const wallpaperId = bg.kind === 'image' ? bg.wallpaperId : null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!wallpaperId) return setUrl(null);
    let objectUrl: string | null = null;
    let alive = true;
    void wallpapersRepo.get(wallpaperId).then((rec) => {
      if (!alive || !rec) return;
      objectUrl = URL.createObjectURL(rec.blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wallpaperId]);

  const image = bg.kind === 'image' ? (url ? `url("${url}")` : 'none') : bg.kind === 'color' ? 'none' : 'var(--bt-bg-image)';
  const color = bg.kind === 'color' ? bg.color : 'var(--bt-bg)';
  const blur = appearance.backgroundBlur;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ backgroundColor: 'var(--bt-bg)' }}>
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
        style={{
          backgroundColor: color,
          backgroundImage: image,
          opacity: appearance.backgroundOpacity,
          filter: blur ? `blur(${blur}px)` : undefined,
          transform: blur ? 'scale(1.06)' : undefined,
        }}
      />
      {bg.kind === 'image' && <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/20" />}
    </div>
  );
}
