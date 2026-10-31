import { memo, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronDown, Search } from 'lucide-react';
import type { SearchProvider, Settings } from '@/shared/types';
import { useNow } from '@/shared/hooks';
import { Kbd, cx } from '@/shared/components/ui';
import { Menu } from '@/shared/components/overlay';
import { formatDate, formatTime, greetingFor, providerName, resolveTarget } from '../format';

/** Clock + greeting. Isolated and memoised so its 1s tick doesn't re-render the dashboard. */
export const Clock = memo(function Clock({ clock, profile }: { clock: Settings['clock']; profile: Settings['profile'] }) {
  const now = useNow(clock.showSeconds ? 1000 : 15_000);
  const { time, period } = formatTime(now, clock);
  const secondary = clock.secondaryTimezone ? safeSecondary(now, clock) : null;
  return (
    <div className="text-center text-[var(--bt-hero-fg)] [text-shadow:var(--bt-hero-shadow,none)]">
      <p className="mb-1 font-display text-[clamp(18px,2vw,24px)] font-light tracking-[-0.01em] opacity-90">{greetingFor(now, profile.name, profile.customGreeting)}</p>
      {clock.show && (
        <>
          <time dateTime={now.toISOString()} className="bt-tabular block font-display text-[clamp(64px,9vw,112px)] leading-[0.95] font-[350] tracking-[-0.035em]">
            {time}
            {period && <span className="ml-2 align-top text-[0.28em] font-normal tracking-normal opacity-70">{period}</span>}
          </time>
          <p className="mt-2 text-[15px] font-medium tracking-wide opacity-85">
            {formatDate(now, clock.dateFormat)}
            {secondary && <span className="ml-3 opacity-80">· {secondary}</span>}
          </p>
        </>
      )}
    </div>
  );
});

function safeSecondary(now: Date, clock: Settings['clock']): string | null {
  try {
    const { time, period } = formatTime(now, { ...clock, showSeconds: false }, clock.secondaryTimezone!);
    const city = clock.secondaryTimezone!.split('/').pop()!.replace(/_/g, ' ');
    return `${city} ${time}${period ? ` ${period}` : ''}`;
  } catch {
    return null;
  }
}

const PROVIDERS: SearchProvider[] = ['default', 'google', 'bing', 'duckduckgo', 'custom'];

export function SearchBar({ search, onProvider }: { search: Settings['search']; onProvider: (p: SearchProvider) => void }) {
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const provBtn = useRef<HTMLButtonElement>(null);

  // "/" or Ctrl/Cmd+K focuses search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function go(newTab: boolean) {
    const target = resolveTarget(q, search.provider, search.customUrl);
    if (!target) return;
    const inNewTab = newTab || search.openInNewTab;
    if (target.kind === 'chrome-search') {
      // Uses the search engine the user picked in Chrome's settings.
      void chrome.search.query({ text: target.text, disposition: inNewTab ? 'NEW_TAB' : 'CURRENT_TAB' });
    } else if (inNewTab) {
      void chrome.tabs.create({ url: target.url, active: !newTab });
    } else {
      window.location.assign(target.url);
    }
    if (newTab) setQ('');
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(false);
  };

  return (
    <form onSubmit={submit} role="search" className="relative mx-auto w-full max-w-[640px]">
      <div className="bt-card flex h-[52px] items-center gap-1 !rounded-full pr-1.5 pl-2 transition-shadow focus-within:ring-4 focus-within:ring-accent-soft">
        <button
          ref={provBtn}
          type="button"
          onClick={() => setMenu(true)}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-muted hover:bg-subtle hover:text-fg"
          aria-label={`Search engine: ${providerName(search.provider)}. Change`}
          aria-haspopup="menu"
        >
          <Search size={16} aria-hidden />
          <span className="hidden sm:inline">{providerName(search.provider)}</span>
          <ChevronDown size={13} aria-hidden />
        </button>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.altKey || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              go(true);
            }
            if (e.key === 'Escape') {
              setQ('');
              input.current?.blur();
            }
          }}
          autoFocus
          aria-label="Search the web or type an address"
          placeholder="Search the web or type an address"
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-muted/80"
          autoComplete="off"
          spellCheck={false}
        />
        {q ? (
          <button type="submit" aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-fg">
            <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <span className="mr-2 hidden items-center gap-1 text-xs text-muted md:flex" aria-hidden>
            <Kbd>/</Kbd>
          </span>
        )}
      </div>
      {menu && (
        <Menu
          anchor={provBtn.current}
          onClose={() => setMenu(false)}
          items={PROVIDERS.map((p) => ({
            label: providerName(p),
            icon: p === search.provider ? Check : undefined,
            onSelect: () => onProvider(p),
          }))}
        />
      )}
      <p className={cx('mt-2 text-center text-[11.5px] text-[var(--bt-hero-fg)] opacity-0 transition-opacity', q && 'opacity-60')} aria-hidden>
        Enter to open · Alt+Enter for a background tab
      </p>
    </form>
  );
}
