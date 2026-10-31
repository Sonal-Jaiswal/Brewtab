import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Settings, Timer } from 'lucide-react';
import '@/styles/global.css';
import { useApplyTheme, useFocusState, useNow, useSettings } from '@/shared/hooks';
import { remainingMs } from '@/modules/scrollstop/focus';
import { formatCountdown, formatDuration, dayKey } from '@/shared/utils';
import { hostOf, hostMatchesDomain } from '@/shared/utils/url';
import { usageRepo } from '@/storage/indexeddb/repos';
import { secondsForDomain } from '@/modules/scrollstop/usage';
import { Button } from '@/shared/components/ui';
import { BrandGlyph } from '@/shared/components/Brand';
import { quoteForDay } from '@/dashboard/widgets/QuoteWidget';

const REASONS: Record<string, string> = {
  focus: 'You’re in a focus session.',
  schedule: 'A blocking schedule is active.',
  always: 'This site is on your blocklist.',
  limit: 'You’ve reached today’s limit for this site.',
};

function Blocked() {
  const [settings] = useSettings();
  useApplyTheme(settings);
  const focus = useFocusState();
  const now = useNow(1000);
  const reason = new URLSearchParams(location.search).get('reason') ?? 'always';
  const original = decodeURIComponentSafe(location.hash.slice(1));
  const host = hostOf(original);
  const [used, setUsed] = useState<number | null>(null);
  const [quote, author] = quoteForDay(now);

  useEffect(() => {
    if (reason !== 'limit' || !host) return;
    void usageRepo.forDate(dayKey()).then((r) => setUsed(secondsForDomain(r, host)));
  }, [reason, host]);

  const limit = host ? settings?.scrollstop.limits.find((l) => hostMatchesDomain(host, l.domain)) : undefined;

  return (
    <main className="grid min-h-full place-items-center bg-bg p-6" style={{ backgroundImage: 'var(--bt-bg-image)', backgroundSize: 'cover' }}>
      <div className="bt-card bt-enter w-full max-w-[520px] p-8 text-center">
        <div className="mx-auto mb-5 w-fit">
          <BrandGlyph size={44} />
        </div>
        <p className="text-[13px] font-semibold tracking-wide text-accent uppercase">ScrollStop</p>
        <h1 className="mt-2 font-display text-[30px] leading-tight font-medium tracking-[-0.02em]">{host ? `${host} is on pause` : 'This page is on pause'}</h1>
        <p className="mt-2 text-muted">{REASONS[reason] ?? REASONS.always}</p>
        {settings?.scrollstop.blockedMessage && <p className="mt-1 text-muted">{settings.scrollstop.blockedMessage}</p>}

        {reason === 'focus' && focus.status !== 'idle' && (
          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-accent">
            <Timer size={16} aria-hidden />
            <span className="bt-tabular font-medium">{formatCountdown(remainingMs(focus, now.getTime()))} left in this focus block</span>
          </div>
        )}
        {reason === 'limit' && used !== null && (
          <p className="mt-6 text-sm text-muted">
            {formatDuration(used)} used today{limit ? ` of your ${limit.minutes}-minute limit` : ''}. It resets at midnight.
          </p>
        )}

        <figure className="mt-8 border-t border-line pt-6">
          <blockquote className="font-display text-lg italic">“{quote}”</blockquote>
          <figcaption className="mt-1 text-xs text-muted">— {author}</figcaption>
        </figure>

        <div className="mt-8 flex justify-center gap-2">
          <Button icon={ArrowLeft} onClick={() => (history.length > 1 ? history.back() : location.assign(chrome.runtime.getURL('newtab.html')))}>
            Go back
          </Button>
          <Button variant="ghost" icon={Settings} onClick={() => void chrome.runtime.openOptionsPage()}>
            ScrollStop settings
          </Button>
        </div>
      </div>
    </main>
  );
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Blocked />
  </StrictMode>,
);
