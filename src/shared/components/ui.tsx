// Brewtab design system primitives. All colours come from theme tokens.
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-sm',
  secondary: 'bg-subtle text-fg hover:bg-[color-mix(in_oklab,var(--bt-subtle),var(--bt-fg)_6%)] border border-line',
  ghost: 'text-fg hover:bg-subtle',
  danger: 'bg-danger text-white hover:brightness-110',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-ctl font-medium whitespace-nowrap transition-[filter,background-color,opacity] duration-150 disabled:opacity-45',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: Size;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-ctl text-muted transition-colors duration-150 hover:bg-subtle hover:text-fg disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        active && 'bg-accent-soft text-accent',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 15 : 18} aria-hidden />
    </button>
  );
});

const fieldBase =
  'w-full rounded-ctl border border-line bg-[var(--bt-field)] px-3 text-fg placeholder:text-muted/70 outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-2 focus:ring-accent-soft';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, 'py-2 leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, 'h-9 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      {children}
    </select>
  );
}
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-40',
        checked ? 'border-accent bg-accent' : 'border-line bg-subtle',
      )}
    >
      <span
        className={cx(
          'inline-block h-4 w-4 rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-[18px] bg-accent-fg' : 'translate-x-[2px] bg-[var(--bt-surface-solid)]',
        )}
      />
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
}) {
  const id = useId();
  // Local state keeps dragging smooth; storage writes are debounced.
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v), 120);
        }}
        className="h-1.5 w-full cursor-pointer accent-[var(--bt-accent)]"
      />
      <span className="bt-tabular w-12 shrink-0 text-right text-[13px] text-muted">{format(local)}</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-ctl border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[calc(var(--bt-radius)*0.45)] px-3 py-1 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-[var(--bt-surface-solid)] text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SettingRow({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-[13px] text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon size={18} aria-hidden />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="mt-1 max-w-xs text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 font-sans text-[11px] text-muted">{children}</kbd>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'danger' | 'success' }) {
  const tones = {
    neutral: 'bg-subtle text-muted',
    accent: 'bg-accent-soft text-accent',
    danger: 'bg-[color-mix(in_oklab,var(--bt-danger)_14%,transparent)] text-danger',
    success: 'bg-[color-mix(in_oklab,var(--bt-success)_16%,transparent)] text-success',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tones[tone])}>{children}</span>;
}

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} aria-describedby={open ? id : undefined}>
      {children}
      {open && (
        <span id={id} role="tooltip" className="bt-popover bt-enter pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap px-2 py-1 text-xs">
          {content}
        </span>
      )}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('bt-card', className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</h3>
      {action}
    </div>
  );
}
