// Modal, toast notifications, confirm dialog and dropdown/context menu.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import { Button, IconButton, cx } from './ui';

// ---------- Modal ----------

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={cx('bt-popover bt-enter w-full text-fg', width)}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Confirm ----------

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

interface PromptOptions {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
}
const PromptContext = createContext<(o: PromptOptions) => Promise<string | null>>(async () => null);
export const usePrompt = () => useContext(PromptContext);

// ---------- Toasts ----------

type ToastTone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(message: string, tone?: ToastTone, action?: ToastItem['action']) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

const toneIcon: Record<ToastTone, LucideIcon> = { info: Info, success: CheckCircle2, error: AlertTriangle };

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = 'info', action?: ToastItem['action']) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
  }, []);

  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const [promptState, setPromptState] = useState<(PromptOptions & { resolve: (v: string | null) => void; value: string }) | null>(null);
  const askText = useCallback((o: PromptOptions) => new Promise<string | null>((resolve) => setPromptState({ ...o, resolve, value: o.initial ?? '' })), []);
  const settlePrompt = (v: string | null) => {
    promptState?.resolve(v?.trim() ? v.trim() : null);
    setPromptState(null);
  };
  const settle = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={ask}>
      <PromptContext.Provider value={askText}>
        {children}
        <Modal
          open={!!promptState}
          onClose={() => settlePrompt(null)}
          title={promptState?.title ?? ''}
          width="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => settlePrompt(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => settlePrompt(promptState?.value ?? null)} disabled={!promptState?.value.trim()}>
                {promptState?.confirmLabel ?? 'Save'}
              </Button>
            </>
          }
        >
          <form onSubmit={(e) => (e.preventDefault(), settlePrompt(promptState?.value ?? null))}>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">{promptState?.label}</span>
              <input
                data-autofocus
                value={promptState?.value ?? ''}
                onChange={(e) => setPromptState((p) => (p ? { ...p, value: e.target.value } : p))}
                className="h-9 w-full rounded-ctl border border-line bg-transparent px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </label>
          </form>
        </Modal>
        <Modal
          open={!!confirm}
          onClose={() => settle(false)}
          title={confirm?.title ?? ''}
          width="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => settle(false)}>
                Cancel
              </Button>
              <Button variant={confirm?.danger ? 'danger' : 'primary'} onClick={() => settle(true)} data-autofocus>
                {confirm?.confirmLabel ?? 'Confirm'}
              </Button>
            </>
          }
        >
          <div className="text-sm text-muted">{confirm?.message}</div>
        </Modal>
        {createPortal(
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-[200] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
            {toasts.map((t) => {
              const Icon = toneIcon[t.tone];
              return (
                <div key={t.id} className="bt-popover bt-enter pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-fg">
                  <Icon size={16} className={t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : 'text-accent'} aria-hidden />
                  <span>{t.message}</span>
                  {t.action && (
                    <button
                      className="ml-1 font-semibold text-accent hover:underline"
                      onClick={() => {
                        t.action?.run();
                        setToasts((all) => all.filter((x) => x.id !== t.id));
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
      </PromptContext.Provider>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

// ---------- Menu (dropdown / context menu) ----------

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Positioned menu. Pass `anchor` (an element) for dropdowns, or `point` for
 * right-click context menus. Arrow keys move focus, Esc closes.
 */
export function Menu({ items, anchor, point, onClose }: { items: MenuItem[]; anchor?: HTMLElement | null; point?: { x: number; y: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = point?.x ?? 0;
    let top = point?.y ?? 0;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      left = r.right - w;
      top = r.bottom + 6;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    if (top + h > window.innerHeight - 8) top = Math.max(8, (anchor ? anchor.getBoundingClientRect().top - h - 6 : top - h));
    setPos({ left, top });
    el.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus();
  }, [anchor, point]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, anchor]);

  return createPortal(
    <div ref={ref} role="menu" className="bt-popover bt-enter fixed z-[150] min-w-44 p-1 text-sm text-fg" style={pos}>
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cx(
            'flex w-full items-center gap-2.5 rounded-[calc(var(--bt-radius)*0.4)] px-2.5 py-1.5 text-left outline-none hover:bg-subtle focus:bg-subtle disabled:opacity-40',
            item.danger && 'text-danger',
          )}
        >
          {item.icon && <item.icon size={15} aria-hidden className={item.danger ? '' : 'text-muted'} />}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
