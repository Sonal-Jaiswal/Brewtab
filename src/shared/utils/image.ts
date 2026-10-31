/** Downscale and re-encode an uploaded wallpaper so new tabs stay fast. */
export async function compressWallpaper(file: Blob, maxSide = 2560, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  if (file.size > 40 * 1024 * 1024) throw new Error('That image is too large (max 40 MB)');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
