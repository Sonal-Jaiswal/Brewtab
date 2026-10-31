// NightShift reading mode: a clean, distraction-free view of the article,
// rendered in a closed shadow root so neither page nor reader styles leak.
// Injected only on demand (popup, context menu). Toggles off when run again.
import { Readability, isProbablyReaderable } from '@mozilla/readability';

declare global {
  interface Window {
    __brewtabReader?: { toggle(): void };
  }
}

type ReaderTheme = 'light' | 'sepia' | 'dark';

(() => {
  if (window.__brewtabReader) {
    window.__brewtabReader.toggle();
    return;
  }

  let host: HTMLDivElement | null = null;
  let prevOverflow = '';

  function close(): void {
    host?.remove();
    host = null;
    document.documentElement.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  const PREFS_KEY = 'readerPrefs';
  async function open(): Promise<void> {
    // Stored in extension storage, never in the site's own localStorage.
    const saved = ((await chrome.storage.local.get(PREFS_KEY))[PREFS_KEY] ?? {}) as { theme?: ReaderTheme; size?: number };
    const save = (patch: { theme?: ReaderTheme; size?: number }) => {
      Object.assign(saved, patch);
      void chrome.storage.local.set({ [PREFS_KEY]: saved });
    };
    const clone = document.cloneNode(true) as Document;
    const article = new Readability(clone, { charThreshold: 300 }).parse();
    host = document.createElement('div');
    host.setAttribute('data-brewtab-reader', '');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const theme: ReaderTheme = saved.theme ?? 'light';
    let size = saved.size ?? 19;

    root.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { position: fixed; inset: 0; overflow: auto; font-family: Georgia, "Iowan Old Style", serif; transition: background .2s; }
        .wrap[data-theme=light] { background: #fbfaf7; color: #1f1d1a; }
        .wrap[data-theme=sepia] { background: #f4ecd8; color: #3b2f22; }
        .wrap[data-theme=dark]  { background: #16181c; color: #d9d6cf; }
        .bar { position: sticky; top: 0; display: flex; gap: 6px; justify-content: flex-end; align-items: center; padding: 10px 16px;
               background: inherit; border-bottom: 1px solid rgba(127,127,127,.18); font: 13px/1 system-ui, sans-serif; }
        .bar .brand { margin-right: auto; opacity: .7; letter-spacing: .02em; }
        button { font: inherit; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
        button:hover { background: rgba(127,127,127,.12); }
        button:focus-visible { outline: 2px solid #c27a3a; outline-offset: 2px; }
        article { max-width: 680px; margin: 0 auto; padding: 40px 24px 120px; line-height: 1.7; }
        h1 { font-size: 2em; line-height: 1.2; margin: 0 0 8px; }
        .meta { font: 14px/1.4 system-ui, sans-serif; opacity: .65; margin-bottom: 32px; }
        img, video, figure { max-width: 100%; height: auto; }
        a { color: #b4632a; }
        pre { white-space: pre-wrap; background: rgba(127,127,127,.1); padding: 12px; border-radius: 8px; }
        .empty { text-align: center; padding: 80px 24px; font-family: system-ui, sans-serif; }
      </style>
      <div class="wrap" data-theme="${theme}" role="dialog" aria-label="Reading mode">
        <div class="bar">
          <span class="brand">NightShift · Reading mode</span>
          <button data-act="smaller" aria-label="Smaller text">A−</button>
          <button data-act="bigger" aria-label="Larger text">A+</button>
          <button data-act="light">Light</button>
          <button data-act="sepia">Sepia</button>
          <button data-act="dark">Dark</button>
          <button data-act="close" aria-label="Close reading mode">Close (Esc)</button>
        </div>
        <article></article>
      </div>`;

    const wrap = root.querySelector('.wrap') as HTMLDivElement;
    const body = root.querySelector('article') as HTMLElement;
    const setSize = () => (body.style.fontSize = `${size}px`);
    setSize();

    if (article?.content && isProbablyReaderable(document)) {
      const h1 = document.createElement('h1');
      h1.textContent = article.title ?? document.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = [article.byline, article.siteName, article.length ? `${Math.max(1, Math.round(article.length / 1200))} min read` : '']
        .filter(Boolean)
        .join(' · ');
      // Parse in an inert document, then strip active content before adopting it.
      const parsed = new DOMParser().parseFromString(article.content, 'text/html');
      parsed.querySelectorAll('script, style, iframe, object, embed, form').forEach((n) => n.remove());
      parsed.querySelectorAll('*').forEach((el) => {
        for (const attr of [...el.attributes]) {
          if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
        }
      });
      const content = document.createElement('div');
      content.append(...[...parsed.body.childNodes].map((n) => document.importNode(n, true)));
      body.append(h1, meta, content);
    } else {
      body.innerHTML = '<div class="empty"><h2>No article found</h2><p>Reading mode works best on articles and blog posts.</p></div>';
    }

    root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (!act) return;
      if (act === 'close') return close();
      if (act === 'smaller' || act === 'bigger') {
        size = Math.min(30, Math.max(14, size + (act === 'bigger' ? 1 : -1)));
        save({ size });
        return setSize();
      }
      wrap.dataset.theme = act;
      save({ theme: act as ReaderTheme });
    });

    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.appendChild(host);
    document.addEventListener('keydown', onKey, true);
    (root.querySelector('[data-act=close]') as HTMLButtonElement).focus();
  }

  window.__brewtabReader = { toggle: () => (host ? close() : void open()) };
  void open();
})();
