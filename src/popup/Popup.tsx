import { useEffect, useState } from 'react';
import { BookOpen, Camera, Crop, ExternalLink, Moon, Pause, Play, ScrollText, Settings, ShieldBan, ShieldCheck, Square, Timer } from 'lucide-react';
import type { Settings as SettingsT } from '@/shared/types';
import { useApplyTheme, useFocusState, useNow, useSettings } from '@/shared/hooks';
import { send, type CaptureMode, type StatusResponse } from '@/shared/messages';
import { remainingMs } from '@/modules/scrollstop/focus';
import { resolvePrefs, siteKeyFor } from '@/modules/nightshift/engine';
import { hostMatchesDomain, hostOf, isCapturableUrl, isRestrictedUrl } from '@/shared/utils/url';
import { dayKey, formatCountdown, formatDuration, uid } from '@/shared/utils';
import { usageRepo } from '@/storage/indexeddb/repos';
import { secondsForDomain } from '@/modules/scrollstop/usage';
import { Badge, Button, IconButton, Toggle, cx } from '@/shared/components/ui';
import { BrandMark } from '@/shared/components/Brand';
import { LinkAvatar } from '@/dashboard/components/LinkAvatar';

export function Popup() {
  const [settings, update] = useSettings();
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [siteSeconds, setSiteSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useApplyTheme(settings);

  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t ?? null));
    void send<StatusResponse>({ type: 'status:get' }).then((r) => r.ok && setStatus(r.data ?? null));
  }, []);

  const host = hostOf(tab?.url);
  useEffect(() => {
    if (!host) return;
    void usageRepo.forDate(dayKey()).then((recs) => setSiteSeconds(secondsForDomain(recs, host)));
  }, [host]);

  if (!settings) return <div className="h-[420px] w-[360px] bg-bg" />;

  const restricted = isRestrictedUrl(tab?.url);

  async function injectNightShift() {
    if (tab?.id && !restricted) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/nightshift.js'] }).catch(() => undefined);
  }

  async function capture(mode: CaptureMode) {
    if (!tab?.id) return;
    setError(null);
    const r = await send({ type: 'snap:capture', mode, tabId: tab.id, windowId: tab.windowId });
    if (!r.ok) return setError(r.error);
    if (mode !== 'visible') window.close();
  }

  return (
    <div className="w-[360px] space-y-2.5 bg-bg p-3 text-fg">
      <header className="flex items-center gap-1 px-1 pb-0.5">
        <BrandMark />
        <div className="ml-auto flex">
          <IconButton icon={ExternalLink} label="Open Brewtab dashboard" size="sm" onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') })} />
          <IconButton icon={Settings} label="Settings" size="sm" onClick={() => void chrome.runtime.openOptionsPage()} />
        </div>
      </header>

      <SiteCard settings={settings} tab={tab} host={host} restricted={restricted} status={status} seconds={siteSeconds} update={update} injectNightShift={injectNightShift} />

      {settings.modules.scrollstop && <FocusCard />}

      <section className="bt-card space-y-0.5 p-2" aria-label="Modules">
        <ModuleRow icon={ShieldBan} name="ScrollStop" detail={status?.blockReason ? `Blocking (${status.blockReason})` : 'Blocking idle'} checked={settings.modules.scrollstop} onChange={(v) => void update({ modules: { scrollstop: v } })} />
        <ModuleRow
          icon={Moon}
          name="NightShift"
          detail={!settings.modules.nightshift ? 'Module off' : settings.nightshift.active ? (settings.nightshift.autoApply ? 'On for every site' : 'On · applies to tabs you open it on') : 'Off'}
          checked={settings.modules.nightshift && settings.nightshift.active}
          onChange={async (v) => {
            await update({ modules: { nightshift: settings.modules.nightshift || v }, nightshift: { active: v } });
            if (v) await injectNightShift();
          }}
        />
        {settings.modules.nightshift && !restricted && (
          <button
            className="flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-left text-[13px] text-muted hover:bg-subtle hover:text-fg"
            onClick={async () => {
              if (tab?.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/reader.js'] }).catch((e) => setError(String(e)));
              window.close();
            }}
          >
            <BookOpen size={15} aria-hidden /> Open reading mode
          </button>
        )}
      </section>

      {settings.modules.snappage && (
        <section className="bt-card p-2.5" aria-label="SnapPage">
          <div className="mb-2 flex items-center gap-1.5 px-0.5 text-[12px] font-semibold tracking-wide text-muted uppercase">
            <Camera size={13} aria-hidden /> SnapPage
          </div>
          {isCapturableUrl(tab?.url) ? (
            <div className="grid grid-cols-3 gap-1.5">
              <SnapButton icon={Camera} label="Visible" onClick={() => void capture('visible')} />
              <SnapButton icon={Crop} label="Region" onClick={() => void capture('region')} disabled={restricted} />
              <SnapButton icon={ScrollText} label="Full page" onClick={() => void capture('fullpage')} disabled={restricted} />
            </div>
          ) : (
            <p className="px-0.5 text-[12.5px] text-muted">Chrome doesn’t allow capturing this page.</p>
          )}
          <a href="snappage.html" target="_blank" className="mt-2 block px-0.5 text-[12px] text-muted hover:text-accent">
            Recent screenshots →
          </a>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-ctl bg-[color-mix(in_oklab,var(--bt-danger)_12%,transparent)] px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function SiteCard({
  settings,
  tab,
  host,
  restricted,
  status,
  seconds,
  update,
  injectNightShift,
}: {
  settings: SettingsT;
  tab: chrome.tabs.Tab | null;
  host: string | null;
  restricted: boolean;
  status: StatusResponse | null;
  seconds: number;
  update: ReturnType<typeof useSettings>[1];
  injectNightShift: () => Promise<void>;
}) {
  if (!tab) return null;
  if (!host || restricted) {
    return (
      <section className="bt-card flex items-center gap-3 p-3 text-[13px] text-muted">
        <ShieldCheck size={18} className="text-accent" aria-hidden />
        {tab.url?.startsWith('chrome-extension://') ? 'This is a Brewtab page.' : 'Browser pages can’t be changed by extensions.'}
      </section>
    );
  }
  const blockRule = settings.scrollstop.blocklist.find((r) => r.kind === 'domain' && hostMatchesDomain(host, r.value));
  const limited = status?.limitDomains.some((d) => hostMatchesDomain(host, d));
  const night = resolvePrefs(settings.nightshift, settings.modules.nightshift, host, new Date());
  const nightOn = night.reason === 'applied';
  const siteKey = siteKeyFor(settings.nightshift, host) ?? host;

  return (
    <section className="bt-card p-3" aria-label="Current site">
      <div className="flex items-center gap-2.5">
        <LinkAvatar title={host} url={tab.url ?? ''} icon={{ kind: 'letter' }} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium">{host}</div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted">
            {seconds > 0 ? `${formatDuration(seconds)} today` : status?.siteAccess || __BREWTAB_E2E__ ? 'No time today' : 'Screen time needs site access'}
            {blockRule && <Badge tone={status?.blockReason ? 'danger' : 'neutral'}>{status?.blockReason ? 'Blocked now' : 'On blocklist'}</Badge>}
            {limited && <Badge tone="danger">Limit reached</Badge>}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {settings.modules.scrollstop && (
          <Button
            size="sm"
            className="flex-1"
            icon={ShieldBan}
            onClick={() =>
              void update((s) => {
                if (blockRule) s.scrollstop.blocklist = s.scrollstop.blocklist.filter((r) => r.id !== blockRule.id);
                else s.scrollstop.blocklist.push({ id: uid('r_'), kind: 'domain', value: host, enabled: true, createdAt: Date.now() });
              })
            }
          >
            {blockRule ? 'Unblock site' : 'Block site'}
          </Button>
        )}
        {settings.modules.nightshift && (
          <Button
            size="sm"
            className={cx('flex-1', nightOn && '!border-accent !bg-accent-soft !text-accent')}
            icon={Moon}
            aria-pressed={nightOn}
            onClick={async () => {
              await update((s) => {
                const cur = s.nightshift.sites[siteKey];
                if (nightOn) s.nightshift.sites[siteKey] = { ...cur, disabled: true };
                else s.nightshift.sites[siteKey] = { prefs: cur?.prefs ?? {}, disabled: false };
              });
              await injectNightShift();
            }}
          >
            {nightOn ? 'NightShift on' : 'NightShift off'}
          </Button>
        )}
      </div>
    </section>
  );
}

function FocusCard() {
  const state = useFocusState();
  const now = useNow(1000);
  const act = (type: 'focus:start' | 'focus:pause' | 'focus:resume' | 'focus:end') => void send({ type });
  return (
    <section className="bt-card flex items-center gap-3 p-3" aria-label="Focus timer">
      <span className={cx('grid h-9 w-9 place-items-center rounded-full', state.status !== 'idle' && state.phase === 'break' ? 'bg-[color-mix(in_oklab,var(--bt-success)_16%,transparent)] text-success' : 'bg-accent-soft text-accent')}>
        <Timer size={17} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="bt-tabular font-display text-[20px] leading-none">{state.status === 'idle' ? 'Focus' : formatCountdown(remainingMs(state, now.getTime()))}</div>
        <div className="mt-0.5 text-[11.5px] text-muted">
          {state.status === 'idle' ? 'Blocks distracting sites while you work' : `${state.phase === 'work' ? 'Focusing' : 'On a break'} · ${state.cycle}/${state.totalCycles}${state.status === 'paused' ? ' · paused' : ''}`}
        </div>
      </div>
      {state.status === 'idle' ? (
        <Button size="sm" variant="primary" icon={Play} onClick={() => act('focus:start')}>
          Start
        </Button>
      ) : (
        <div className="flex gap-1">
          {state.status === 'running' ? (
            <IconButton icon={Pause} label="Pause focus" size="sm" onClick={() => act('focus:pause')} />
          ) : (
            <IconButton icon={Play} label="Resume focus" size="sm" onClick={() => act('focus:resume')} />
          )}
          <IconButton icon={Square} label="End focus" size="sm" onClick={() => act('focus:end')} />
        </div>
      )}
    </section>
  );
}

function ModuleRow({ icon: Icon, name, detail, checked, onChange }: { icon: typeof Moon; name: string; detail: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-ctl px-2 py-1.5">
      <Icon size={16} className="text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{name}</div>
        <div className="truncate text-[11.5px] text-muted">{detail}</div>
      </div>
      <Toggle label={`Toggle ${name}`} checked={checked} onChange={onChange} />
    </div>
  );
}

function SnapButton({ icon: Icon, label, onClick, disabled }: { icon: typeof Camera; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-ctl border border-line py-2.5 text-[12px] font-medium transition hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-transparent disabled:hover:text-fg"
    >
      <Icon size={17} aria-hidden />
      {label}
    </button>
  );
}
