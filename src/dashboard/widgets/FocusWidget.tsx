import { Pause, Play, Square, Timer } from 'lucide-react';
import { useFocusState, useLiveQuery, useNow } from '@/shared/hooks';
import { focusRepo } from '@/storage/indexeddb/repos';
import { remainingMs } from '@/modules/scrollstop/focus';
import { send } from '@/shared/messages';
import { Button, cx } from '@/shared/components/ui';
import { useToast } from '@/shared/components/overlay';
import { formatCountdown, formatDuration } from '@/shared/utils';
import type { WidgetProps } from './registry';

const PRESETS = [15, 25, 50];

export default function FocusWidget({ settings }: WidgetProps) {
  const state = useFocusState();
  const toast = useToast();
  const now = useNow(1000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const { data: today = [] } = useLiveQuery(() => focusRepo.since(startOfDay), ['focusSessions'], [startOfDay]);
  const focusedToday = today.reduce((s, r) => s + r.focusedMs, 0);
  const cfg = settings.scrollstop.focus;
  const blockCount = settings.scrollstop.blocklist.filter((r) => r.enabled).length;

  const act = async (msg: Parameters<typeof send>[0]) => {
    const r = await send(msg);
    if (!r.ok) toast(r.error, 'error');
  };

  const remaining = remainingMs(state, now.getTime());
  const total = state.status === 'idle' ? cfg.workMinutes * 60_000 : state.phaseDurationMs;
  const progress = state.status === 'idle' ? 0 : 1 - remaining / total;
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex h-full flex-col items-center justify-between text-center">
      <div className="relative mt-1 grid place-items-center">
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden className="-rotate-90">
          <circle cx="66" cy="66" r={R} fill="none" stroke="var(--bt-line)" strokeWidth="6" />
          <circle
            cx="66"
            cy="66"
            r={R}
            fill="none"
            stroke={state.status !== 'idle' && state.phase === 'break' ? 'var(--bt-success)' : 'var(--bt-accent)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <div className="bt-tabular font-display text-[30px] leading-none font-medium" aria-live="off">
              {formatCountdown(state.status === 'idle' ? cfg.workMinutes * 60_000 : remaining)}
            </div>
            <div className="mt-1 text-[11px] font-medium tracking-wide text-muted uppercase">
              {state.status === 'idle' ? 'Ready' : `${state.phase === 'work' ? 'Focus' : 'Break'} ${state.cycle}/${state.totalCycles}${state.status === 'paused' ? ' · paused' : ''}`}
            </div>
          </div>
        </div>
      </div>

      {state.status === 'idle' ? (
        <div className="w-full space-y-2">
          <div className="flex justify-center gap-1">
            {PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => void act({ type: 'focus:start', minutes: m })}
                className={cx('rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent')}
              >
                {m}m
              </button>
            ))}
          </div>
          <Button variant="primary" icon={Play} className="w-full" onClick={() => void act({ type: 'focus:start' })}>
            Start {cfg.cycles > 1 ? `${cfg.cycles} × ${cfg.workMinutes}m` : `${cfg.workMinutes}m`}
          </Button>
        </div>
      ) : (
        <div className="flex w-full gap-2">
          {state.status === 'running' ? (
            <Button className="flex-1" icon={Pause} onClick={() => void act({ type: 'focus:pause' })}>
              Pause
            </Button>
          ) : (
            <Button className="flex-1" variant="primary" icon={Play} onClick={() => void act({ type: 'focus:resume' })}>
              Resume
            </Button>
          )}
          <Button className="flex-1" icon={Square} onClick={() => void act({ type: 'focus:end' })}>
            End
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        <Timer size={12} aria-hidden />
        {formatDuration(focusedToday / 1000)} focused today
        {cfg.blockDuringFocus && <> · blocks {blockCount} site{blockCount === 1 ? '' : 's'}</>}
      </div>
    </div>
  );
}
