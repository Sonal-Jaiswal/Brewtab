// SnapPage full-page helper: scrolls the document for the service worker,
// hides fixed/sticky elements after the first frame (so headers aren't
// repeated in every slice) and restores everything afterwards.
(() => {
  if (window.__brewtabFullpage) return;

  const hidden: { el: HTMLElement; visibility: string }[] = [];
  let original = { x: 0, y: 0, behavior: '' };

  const settle = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120))));

  function hideFixed(): void {
    if (hidden.length) return;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        hidden.push({ el, visibility: el.style.visibility });
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  }

  window.__brewtabFullpage = {
    prepare() {
      const se = document.scrollingElement ?? document.documentElement;
      original = { x: window.scrollX, y: window.scrollY, behavior: document.documentElement.style.scrollBehavior };
      document.documentElement.style.scrollBehavior = 'auto';
      const scrollHeight = Math.max(se.scrollHeight, document.body?.scrollHeight ?? 0);
      return {
        scrollHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        scrollable: scrollHeight > window.innerHeight + 4,
      };
    },
    async scrollTo(y: number) {
      if (y > 0) hideFixed();
      window.scrollTo(0, y);
      await settle();
      return window.scrollY;
    },
    restore() {
      for (const { el, visibility } of hidden) el.style.visibility = visibility;
      hidden.length = 0;
      window.scrollTo(original.x, original.y);
      document.documentElement.style.scrollBehavior = original.behavior;
      delete window.__brewtabFullpage;
    },
  };
})();

export {};
