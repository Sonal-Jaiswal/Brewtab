import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, HardDrive, Lock, ShieldBan, ShieldCheck } from 'lucide-react';
import type { SearchProvider, Settings, ThemeId } from '@/shared/types';
import type { DeepPartial } from '@/shared/utils';
import { Button, Input, Toggle, cx } from '@/shared/components/ui';
import { BrandGlyph } from '@/shared/components/Brand';
import { SITE_ACCESS, requestPermission } from '@/shared/permissions';
import { usePermission } from '@/shared/hooks';
import { dashboardRepo } from '@/storage/indexeddb/repos';
import { THEMES } from './TopBar';
import { providerName } from '../format';
import { SUGGESTED_SITES, addLink, EMPTY_LINKS, findDuplicate } from '../quicklinks';
import { LinkAvatar } from './LinkAvatar';

const STEPS = ['Welcome', 'Look', 'Search', 'Focus', 'Shortcuts', 'Privacy'] as const;

export default function Onboarding({ settings, update }: { settings: Settings; update: (p: DeepPartial<Settings>) => Promise<Settings> }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.profile.name);
  const [sites, setSites] = useState<Set<string>>(new Set(['https://mail.google.com', 'https://calendar.google.com', 'https://github.com']));
  const [siteAccess] = usePermission(SITE_ACCESS);

  async function finish() {
    const existing = await dashboardRepo.getQuickLinks();
    let state = existing ? { links: existing.links, folders: existing.folders } : EMPTY_LINKS;
    for (const s of SUGGESTED_SITES.filter((x) => sites.has(x.url))) {
      if (!findDuplicate(state, s.url)) state = addLink(state, s).state;
    }
    await dashboardRepo.saveQuickLinks(state);
    await update({ onboarded: true, profile: { name: name.trim() } });
  }

  const skip = () => void update({ onboarded: true, profile: { name: name.trim() } });
  const next = () => (step === STEPS.length - 1 ? void finish() : setStep(step + 1));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/30 p-4 backdrop-blur-md">
      <div role="dialog" aria-modal="true" aria-label="Welcome to Brewtab" className="bt-popover bt-enter w-full max-w-[560px] overflow-hidden text-fg">
        <div className="flex items-center justify-between px-6 pt-5">
          <ol className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s} className={cx('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-accent' : i < step ? 'w-1.5 bg-accent/60' : 'w-1.5 bg-line')} aria-current={i === step ? 'step' : undefined}>
                <span className="sr-only">{s}</span>
              </li>
            ))}
          </ol>
          <button onClick={skip} className="text-[13px] text-muted hover:text-fg">
            Skip setup
          </button>
        </div>

        <div className="min-h-[340px] px-6 py-6">
          {step === 0 && (
            <div className="space-y-5">
              <BrandGlyph size={44} />
              <div>
                <h1 className="font-display text-[30px] leading-tight font-medium tracking-[-0.02em]">Start every tab fresh.</h1>
                <p className="mt-2 text-[14.5px] text-muted">
                  Brewtab turns your new tab into a calm dashboard for tasks, notes and focus, and can block distracting sites while you work.
                </p>
              </div>
              <label className="block space-y-1.5">
                <span className="text-[13px] font-medium">What should we call you?</span>
                <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name (optional)" maxLength={40} onKeyDown={(e) => e.key === 'Enter' && next()} />
              </label>
            </div>
          )}

          {step === 1 && (
            <div>
              <StepTitle title="Pick a look" sub="You can upload your own wallpaper and fine-tune colours later." />
              <div className="grid grid-cols-2 gap-3">
                {THEMES.map((t) => (
                  <button key={t.id} onClick={() => void update({ appearance: { theme: t.id as ThemeId } })} aria-pressed={settings.appearance.theme === t.id} className="text-left">
                    <span className={cx('block h-24 rounded-card border-2 transition', settings.appearance.theme === t.id ? 'border-accent' : 'border-line hover:border-muted')} style={{ background: t.swatch }} />
                    <span className="mt-1.5 block text-[13px] font-medium">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <StepTitle title="Choose your search engine" sub="“Chrome default” keeps the engine you already use. Brewtab never sees your searches." />
              <div className="space-y-2">
                {(['default', 'google', 'bing', 'duckduckgo'] as SearchProvider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => void update({ search: { provider: p } })}
                    aria-pressed={settings.search.provider === p}
                    className={cx('flex w-full items-center justify-between rounded-card border px-4 py-3 text-left text-sm font-medium', settings.search.provider === p ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle')}
                  >
                    {providerName(p)}
                    {settings.search.provider === p && <Check size={16} className="text-accent" />}
                  </button>
                ))}
                <p className="text-xs text-muted">A custom search URL can be set in Settings → Search.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <StepTitle title="Block distractions" sub="ScrollStop blocks the sites you choose during focus sessions, on a schedule or all the time. You can turn it off at any time." />
              <div className="flex items-center gap-3 rounded-card border border-line px-3.5 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-ctl bg-accent-soft text-accent">
                  <ShieldBan size={17} aria-hidden />
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">ScrollStop</div>
                  <div className="text-[12.5px] text-muted">Blocking, focus & screen time</div>
                </div>
                <Toggle label="Enable ScrollStop" checked={settings.modules.scrollstop} onChange={(v) => void update({ modules: { scrollstop: v } })} />
              </div>
              <div className="mt-4 rounded-card bg-subtle p-3.5 text-[13px]">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck size={15} className="text-accent" aria-hidden /> Optional: site access
                </div>
                <p className="mt-1 text-muted">
                  Without it, blocking uses Chrome’s standard block page. With it, Brewtab can show its own blocked page and track screen time.
                </p>
                {siteAccess ? (
                  <p className="mt-2 flex items-center gap-1.5 font-medium text-success">
                    <Check size={14} /> Site access granted
                  </p>
                ) : (
                  <Button size="sm" className="mt-2" onClick={() => void requestPermission(SITE_ACCESS)}>
                    Allow site access
                  </Button>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <StepTitle title="Add a few shortcuts" sub="Pick some to start with. You can import Chrome bookmarks from the dashboard." />
              <ul className="grid grid-cols-5 gap-2">
                {SUGGESTED_SITES.map((s) => {
                  const on = sites.has(s.url);
                  return (
                    <li key={s.url}>
                      <button
                        onClick={() => {
                          const n = new Set(sites);
                          if (on) n.delete(s.url);
                          else n.add(s.url);
                          setSites(n);
                        }}
                        aria-pressed={on}
                        className={cx('relative flex w-full flex-col items-center gap-1.5 rounded-card border p-2 text-[11.5px]', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle')}
                      >
                        <LinkAvatar title={s.title} url={s.url} icon={{ kind: 'letter' }} size={34} />
                        <span className="w-full truncate text-center">{s.title}</span>
                        {on && <Check size={12} className="absolute top-1 right-1 text-accent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 5 && (
            <div>
              <StepTitle title="Your data stays here" sub="Brewtab has no servers, no accounts and no analytics." />
              <ul className="space-y-3 text-[13.5px]">
                <Bullet icon={HardDrive} title="Stored on this device">
                  Tasks, notes, shortcuts, screen-time totals and focus history live in your browser’s local storage.
                </Bullet>
                <Bullet icon={Lock} title="Never uploaded">
                  Nothing is sent anywhere. Search queries go directly to your search engine.
                </Bullet>
                <Bullet icon={ShieldCheck} title="You’re in control">
                  Export, import or erase everything from Settings → Data. Optional permissions can be revoked any time.
                </Bullet>
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-6 py-4">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)} disabled={step === 0}>
            Back
          </Button>
          <Button variant="primary" onClick={next}>
            {step === STEPS.length - 1 ? 'Start using Brewtab' : 'Continue'} {step < STEPS.length - 1 && <ArrowRight size={16} aria-hidden />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-[24px] leading-tight font-medium tracking-[-0.015em]">{title}</h2>
      <p className="mt-1 text-[13.5px] text-muted">{sub}</p>
    </div>
  );
}

function Bullet({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl bg-accent-soft text-accent">
        <Icon size={15} aria-hidden />
      </span>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-muted">{children}</div>
      </div>
    </li>
  );
}
