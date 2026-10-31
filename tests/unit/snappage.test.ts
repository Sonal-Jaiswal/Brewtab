import { describe, expect, it } from 'vitest';
import { createDoc, createHistory, hitTest, moveShape, outputSize, reducer, type Shape } from '@/snappage/state';

const rect = (id: string, x = 10, y = 10, w = 50, h = 40): Shape => ({ id, type: 'rect', x, y, w, h, color: '#f00', stroke: 4 });

describe('SnapPage editor state', () => {
  it('adds annotations and supports undo/redo', () => {
    let h = createHistory(createDoc(800, 600));
    h = reducer(h, { type: 'add', shape: rect('a') });
    h = reducer(h, { type: 'add', shape: { id: 'b', type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 50, color: '#000', stroke: 4 } });
    h = reducer(h, { type: 'add', shape: { id: 't', type: 'text', x: 5, y: 5, text: 'Hello', size: 24, color: '#fff', stroke: 0 } });
    expect(h.present.shapes.map((s) => s.id)).toEqual(['a', 'b', 't']);
    h = reducer(h, { type: 'undo' });
    h = reducer(h, { type: 'undo' });
    expect(h.present.shapes.map((s) => s.id)).toEqual(['a']);
    h = reducer(h, { type: 'redo' });
    expect(h.present.shapes.map((s) => s.id)).toEqual(['a', 'b']);
    h = reducer(h, { type: 'add', shape: rect('c') });
    expect(h.future).toEqual([]); // new action clears redo stack
  });

  it('ignores degenerate shapes (accidental clicks)', () => {
    const h = createHistory(createDoc(100, 100));
    expect(reducer(h, { type: 'add', shape: rect('x', 0, 0, 1, 1) })).toBe(h);
    expect(reducer(h, { type: 'add', shape: { id: 't', type: 'text', x: 0, y: 0, text: '  ', size: 20, color: '#000', stroke: 0 } })).toBe(h);
  });

  it('crops within image bounds and can be undone', () => {
    let h = createHistory(createDoc(1000, 800));
    h = reducer(h, { type: 'crop', rect: { x: 900, y: 700, w: -300, h: -200 } });
    expect(h.present.crop).toEqual({ x: 600, y: 500, w: 300, h: 200 });
    h = reducer(h, { type: 'crop', rect: { x: 950, y: 0, w: 500, h: 100 } });
    expect(h.present.crop).toEqual({ x: 950, y: 0, w: 50, h: 100 });
    h = reducer(h, { type: 'undo' });
    expect(h.present.crop.x).toBe(600);
    h = reducer(h, { type: 'resetCrop' });
    expect(h.present.crop).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });

  it('starts with the region crop from a region capture', () => {
    const d = createDoc(1000, 800, { x: 100, y: 100, w: 200, h: 150 });
    expect(outputSize(d)).toEqual({ width: 200, height: 150 });
  });

  it('resizes output keeping aspect ratio', () => {
    let h = createHistory(createDoc(1200, 800));
    h = reducer(h, { type: 'resize', width: 600 });
    expect(outputSize(h.present)).toEqual({ width: 600, height: 400 });
  });

  it('hit-tests topmost shape and moves it', () => {
    const shapes = [rect('a', 0, 0, 100, 100), rect('b', 50, 50, 100, 100)];
    expect(hitTest(shapes, 75, 75)?.id).toBe('b');
    expect(hitTest(shapes, 10, 10)?.id).toBe('a');
    expect(hitTest(shapes, 400, 400)).toBeNull();
    expect(moveShape(shapes[0], 5, -5)).toEqual({ x: 5, y: -5 });
  });

  it('updates and removes shapes as undoable steps', () => {
    let h = createHistory(createDoc(100, 100));
    h = reducer(h, { type: 'add', shape: rect('a') });
    h = reducer(h, { type: 'update', id: 'a', patch: { color: '#00f' } });
    expect(h.present.shapes[0].color).toBe('#00f');
    h = reducer(h, { type: 'remove', id: 'a' });
    expect(h.present.shapes).toEqual([]);
    h = reducer(h, { type: 'undo' });
    expect(h.present.shapes[0].color).toBe('#00f');
  });
});

describe('SnapPage capture guards', () => {
  it('recognises pages Chrome will not let extensions capture', async () => {
    const { isCapturableUrl, isRestrictedUrl } = await import('@/shared/utils/url');
    for (const u of ['chrome://settings', 'chrome-extension://abc/page.html', 'https://chromewebstore.google.com/detail/x', 'https://chrome.google.com/webstore/x', 'about:blank', 'view-source:https://a.com', undefined]) {
      expect(isCapturableUrl(u), String(u)).toBe(false);
    }
    expect(isCapturableUrl('https://example.com')).toBe(true);
    expect(isCapturableUrl('file:///tmp/a.html')).toBe(true);
    expect(isRestrictedUrl('file:///tmp/a.html')).toBe(true); // capturable, but no script injection
    expect(isRestrictedUrl('https://chrome.google.com/search')).toBe(false);
  });

  it('turns Chrome capture errors into actionable messages', async () => {
    const { captureErrorMessage, RESTRICTED_MESSAGE } = await import('@/background/snappage');
    expect(captureErrorMessage('Cannot access contents of the page. Extension manifest must request permission to access the respective host.')).toBe(RESTRICTED_MESSAGE);
    expect(captureErrorMessage("The 'activeTab' permission is not in effect because this extension has not been in invoked.")).toMatch(/Click the Brewtab icon/);
    expect(captureErrorMessage('Tabs cannot be edited right now')).toBe('Capture failed: Tabs cannot be edited right now');
  });
});
