// SnapPage capture pipeline. Uses chrome.tabs.captureVisibleTab (granted by
// activeTab when the user clicks the popup, context menu or shortcut).
// Full-page capture scrolls the page and stitches frames on an OffscreenCanvas.
// Screenshots are stored in IndexedDB only — never uploaded anywhere.
import type { CaptureRecord } from '@/shared/types';
import { capturesRepo } from '@/storage/indexeddb/repos';
import { getSettings } from '@/storage/chrome-storage/settings';
import { isCapturableUrl, isRestrictedUrl } from '@/shared/utils/url';
import { uid } from '@/shared/utils';

/** Chrome allows ~2 captureVisibleTab calls per second. */
const CAPTURE_GAP_MS = 550;
/** Stay well within canvas limits to avoid crashes/blank canvases. */
const MAX_CANVAS_HEIGHT = 30_000;
const MAX_CANVAS_AREA = 200_000_000;

export class CaptureError extends Error {}

export const RESTRICTED_MESSAGE = 'This page can’t be captured. Chrome blocks extensions on browser pages, the Web Store and other extensions.';

let lastCapture = 0;
async function captureTab(windowId: number): Promise<Blob> {
  const wait = lastCapture + CAPTURE_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCapture = Date.now();
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return await (await fetch(dataUrl)).blob();
  } catch (err) {
    throw new CaptureError(captureErrorMessage(err instanceof Error ? err.message : String(err)));
  }
}

/** Translate Chrome's captureVisibleTab errors into something a person can act on. */
export function captureErrorMessage(chromeMessage: string): string {
  // Every capture entry point (popup, menu, shortcut) grants activeTab, so
  // "cannot access" means Chrome is protecting the page (chrome://, Web Store…).
  if (/cannot access|chrome:\/\/|chrome-extension:\/\/|extensions gallery|webstore|cannot be scripted/i.test(chromeMessage)) return RESTRICTED_MESSAGE;
  if (/activeTab|permission/i.test(chromeMessage)) return 'Chrome did not allow capturing this tab. Click the Brewtab icon on the page first, then try again.';
  return `Capture failed: ${chromeMessage}`;
}

function assertCapturable(tab: chrome.tabs.Tab): void {
  // tab.url is only visible with activeTab/host access; if hidden, let Chrome decide.
  if (tab.url && !isCapturableUrl(tab.url)) {
    throw new CaptureError(RESTRICTED_MESSAGE);
  }
}

async function save(tab: chrome.tabs.Tab, blob: Blob, kind: CaptureRecord['kind'], extra: Partial<CaptureRecord> = {}): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const rec: CaptureRecord = {
    id: uid('c_'),
    createdAt: Date.now(),
    url: tab.url ?? '',
    title: tab.title ?? 'Screenshot',
    kind,
    width: bmp.width,
    height: bmp.height,
    crop: null,
    note: null,
    blob,
    ...extra,
  };
  bmp.close();
  const settings = await getSettings();
  await capturesRepo.add(rec, settings.snappage.keepRecent);
  return rec.id;
}

export async function openEditor(id: string, tab?: chrome.tabs.Tab): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`snappage.html?id=${encodeURIComponent(id)}`), index: tab ? tab.index + 1 : undefined });
}

export async function captureVisible(tab: chrome.tabs.Tab): Promise<string> {
  assertCapturable(tab);
  const blob = await captureTab(tab.windowId);
  const id = await save(tab, blob, 'visible');
  await openEditor(id, tab);
  return id;
}

export async function startRegionCapture(tab: chrome.tabs.Tab): Promise<void> {
  assertCapturable(tab);
  if (!tab.id || (tab.url && isRestrictedUrl(tab.url))) {
    throw new CaptureError('Region selection needs a regular web page. Use “Visible area” here instead.');
  }
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/region.js'] });
}

export async function finishRegionCapture(tab: chrome.tabs.Tab, rect: { x: number; y: number; w: number; h: number }, viewportWidth: number): Promise<string> {
  const blob = await captureTab(tab.windowId);
  const bmp = await createImageBitmap(blob);
  const scale = bmp.width / Math.max(1, viewportWidth);
  const crop = {
    x: Math.max(0, Math.round(rect.x * scale)),
    y: Math.max(0, Math.round(rect.y * scale)),
    w: Math.min(bmp.width, Math.round(rect.w * scale)),
    h: Math.min(bmp.height, Math.round(rect.h * scale)),
  };
  bmp.close();
  crop.w = Math.min(crop.w, bmp.width - crop.x);
  crop.h = Math.min(crop.h, bmp.height - crop.y);
  const id = await save(tab, blob, 'region', { crop: crop.w > 4 && crop.h > 4 ? crop : null });
  await openEditor(id, tab);
  return id;
}

interface FullpageInfo {
  scrollHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  scrollable: boolean;
}

export async function captureFullPage(tab: chrome.tabs.Tab, onProgress?: (pct: number) => void): Promise<string> {
  assertCapturable(tab);
  const tabId = tab.id;
  if (!tabId || (tab.url && isRestrictedUrl(tab.url))) throw new CaptureError('Full-page capture needs a regular web page.');
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/fullpage.js'] });
  const exec = async <T>(func: (...args: number[]) => T | Promise<T>, args: number[] = []): Promise<T> => {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return res?.result as T;
  };

  const info = await exec(() => window.__brewtabFullpage!.prepare() as unknown as FullpageInfo);
  let note: string | null = null;
  try {
    if (!info.scrollable) {
      note = 'This page scrolls inside an inner container, so only the visible area could be captured.';
    }
    const first = await createImageBitmap(await captureTabAt(0));
    const scale = first.width / Math.max(1, info.viewportWidth);
    const width = first.width;
    const maxHeight = Math.min(MAX_CANVAS_HEIGHT, Math.floor(MAX_CANVAS_AREA / width));
    const fullHeight = Math.round(info.scrollHeight * scale);
    const height = info.scrollable ? Math.min(fullHeight, maxHeight) : first.height;
    if (info.scrollable && fullHeight > maxHeight) note = 'This page is very long, so the capture was cut off at the bottom.';

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(first, 0, 0);
    first.close();

    if (info.scrollable) {
      const stepCss = info.viewportHeight;
      const steps = Math.ceil(height / scale / stepCss);
      for (let i = 1; i < steps; i++) {
        onProgress?.(Math.round((i / steps) * 100));
        const blob = await captureTabAt(i * stepCss);
        const bmp = await createImageBitmap(blob);
        const actualY = lastScrollY;
        ctx.drawImage(bmp, 0, Math.round(actualY * scale));
        bmp.close();
      }
    }
    const out = await canvas.convertToBlob({ type: 'image/png' });
    onProgress?.(100);
    const id = await save(tab, out, 'fullpage', { note });
    await openEditor(id, tab);
    return id;
  } finally {
    await exec(() => window.__brewtabFullpage?.restore()).catch(() => undefined);
  }

  // Scroll, let the page settle (lazy content, sticky headers hidden), then capture.
  async function captureTabAt(y: number): Promise<Blob> {
    lastScrollY = await exec((top) => window.__brewtabFullpage!.scrollTo(top), [y]);
    return captureTab(tab.windowId);
  }
}
let lastScrollY = 0;

declare global {
  interface Window {
    __brewtabFullpage?: {
      prepare(): FullpageInfo;
      scrollTo(y: number): Promise<number>;
      restore(): void;
    };
  }
}
