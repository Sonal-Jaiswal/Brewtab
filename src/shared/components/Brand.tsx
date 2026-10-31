import { cx } from './ui';

/** Brewtab mark: a cup whose steam forms a tab outline. */
export function BrandGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden fill="none">
      <rect x="2" y="2" width="28" height="28" rx="9" fill="var(--bt-accent)" />
      <path d="M9.5 15h11v4.2a4.8 4.8 0 0 1-4.8 4.8h-1.4a4.8 4.8 0 0 1-4.8-4.8V15Z" fill="var(--bt-accent-fg)" />
      <path d="M20.5 16.2h1.2a2.1 2.1 0 0 1 0 4.2h-1.6" stroke="var(--bt-accent-fg)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12.5 12.2c0-1.6 1.4-1.6 1.4-3.2M16.5 12.2c0-1.6 1.4-1.6 1.4-3.2" stroke="var(--bt-accent-fg)" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <BrandGlyph />
      <span className="font-display text-[17px] font-medium tracking-[-0.01em]">Brewtab</span>
    </span>
  );
}
