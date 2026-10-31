import { useState } from 'react';
import type { SearchProvider } from '@/shared/types';
import { Input, SettingRow, Toggle, cx } from '@/shared/components/ui';
import { isValidSearchTemplate, providerName } from '@/dashboard/format';
import { Page, Panel, type SectionProps } from '../App';

export default function SearchSection({ settings, update }: SectionProps) {
  const s = settings.search;
  const [draft, setDraft] = useState(s.customUrl);
  const valid = isValidSearchTemplate(draft);

  return (
    <Page title="Search" description="Searches go directly from your browser to the provider you choose. Brewtab never sees or stores them.">
      <Panel title="Search provider">
        <div className="grid gap-2 py-2 sm:grid-cols-5" role="radiogroup" aria-label="Search provider">
          {(['default', 'google', 'bing', 'duckduckgo', 'custom'] as SearchProvider[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={s.provider === p}
              onClick={() => void update({ search: { provider: p } })}
              className={cx('rounded-card border px-4 py-3 text-left text-sm font-medium transition', s.provider === p ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-subtle')}
            >
              {providerName(p)}
            </button>
          ))}
        </div>
        {s.provider === 'default' && <p className="mt-2 text-xs text-muted">Uses whichever search engine you’ve chosen in Chrome’s settings.</p>}
        {s.provider === 'custom' && (
          <div className="mt-3 space-y-1.5">
            <label htmlFor="custom-url" className="text-[13px] font-medium">
              Custom search URL
            </label>
            <Input
              id="custom-url"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => valid && void update({ search: { customUrl: draft.trim() } })}
              aria-invalid={!valid}
              placeholder="https://search.example/?q=%s"
            />
            <p className={cx('text-xs', valid ? 'text-muted' : 'text-danger')}>
              {valid ? 'Use %s where the search terms should go.' : 'Enter an http(s) address containing %s. Until then, Chrome’s default search engine is used.'}
            </p>
          </div>
        )}
      </Panel>
      <Panel title="Behaviour">
        <SettingRow title="Open results in a new tab" description="Alt+Enter always opens a background tab.">
          <Toggle label="Open in new tab" checked={s.openInNewTab} onChange={(v) => void update({ search: { openInNewTab: v } })} />
        </SettingRow>
        <SettingRow title="Keyboard shortcuts" description="Press / or Ctrl/⌘+K on the dashboard to jump to search.">
          <span />
        </SettingRow>
      </Panel>
    </Page>
  );
}
