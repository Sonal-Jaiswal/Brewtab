// SnapPage region selector: a temporary overlay to drag out a rectangle.
// Removed before the capture so it never appears in the screenshot.
(() => {
  const ATTR = 'data-brewtab-region';
  if (document.querySelector(`[${ATTR}]`)) return;

  const overlay = document.createElement('div');
  overlay.setAttribute(ATTR, '');
  overlay.style.cssText =
    'all: initial; position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair; background: rgba(15,12,10,.35);';
  const box = document.createElement('div');
  box.style.cssText =
    'position: fixed; border: 2px solid #f0a35e; background: rgba(240,163,94,.08); box-shadow: 0 0 0 99999px rgba(15,12,10,.35); display: none; pointer-events: none;';
  const hint = document.createElement('div');
  hint.textContent = 'Drag to select an area · Esc to cancel';
  hint.style.cssText =
    'position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px; background: #1d1a17; color: #f6efe7; font: 13px/1.2 system-ui, sans-serif; pointer-events: none;';
  overlay.append(box, hint);

  let start: { x: number; y: number } | null = null;
  let rect = { x: 0, y: 0, w: 0, h: 0 };

  const cleanup = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      void chrome.runtime.sendMessage({ type: 'snap:region-cancel' });
    }
  };

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    overlay.style.background = 'transparent';
    hint.style.display = 'none';
    box.style.display = 'block';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!start) return;
    rect = {
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x),
      h: Math.abs(e.clientY - start.y),
    };
    Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
  });

  overlay.addEventListener('mouseup', () => {
    if (!start) return;
    start = null;
    cleanup();
    if (rect.w < 5 || rect.h < 5) {
      void chrome.runtime.sendMessage({ type: 'snap:region-cancel' });
      return;
    }
    // Wait two frames so the overlay is gone from the composited page.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void chrome.runtime.sendMessage({ type: 'snap:region-selected', rect, viewportWidth: window.innerWidth });
      }),
    );
  });

  document.addEventListener('keydown', onKey, true);
  document.documentElement.appendChild(overlay);
})();
