import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';

export interface EditorialPosterItem {
  label: string;
  value: ReactNode;
}

export interface EditorialPosterProps {
  className?: string;
  detail?: ReactNode;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  items?: EditorialPosterItem[];
  subtitle?: ReactNode;
  testId?: string;
  title: ReactNode;
}

export default function EditorialPoster({
  className,
  detail,
  eyebrow,
  footer,
  items = [],
  subtitle,
  testId,
  title,
}: EditorialPosterProps): React.ReactElement {
  return (
    <article
      className={cn(
        'relative overflow-hidden border border-[var(--gen-accent-border)] bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_45%,rgba(255,255,255,0.01))] p-8 sm:p-10 lg:p-12',
        'shadow-[0_24px_80px_rgba(0,0,0,0.28)]',
        className,
      )}
      data-testid={testId}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--gen-accent-glow),transparent_45%),linear-gradient(to_bottom,transparent,rgba(0,0,0,0.45))]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-screen">
        <div className="absolute inset-y-0 left-[14%] w-px bg-[var(--gen-accent-border)]" />
        <div className="absolute inset-y-0 right-[18%] w-px bg-[var(--gen-accent-border)]" />
        <div className="absolute left-0 right-0 top-[18%] h-px bg-[var(--gen-accent-border)]" />
        <div className="absolute left-0 right-0 bottom-[22%] h-px bg-[var(--gen-accent-border)]" />
      </div>

      <div className="relative z-10 flex min-h-[420px] flex-col justify-between gap-10">
        <div className="space-y-5">
          {eyebrow ? (
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--gen-accent-text)]">
              {eyebrow}
            </div>
          ) : null}

          <div className="max-w-2xl space-y-4">
            <h2 className="text-4xl font-serif leading-[0.92] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
              {title}
            </h2>

            {subtitle ? (
              <p className="max-w-xl text-sm uppercase tracking-[0.2em] text-[var(--gen-accent-text)] sm:text-[13px]">
                {subtitle}
              </p>
            ) : null}

            {detail ? (
              <p className="max-w-xl text-base leading-relaxed text-foreground/72 sm:text-lg">
                {detail}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          {items.length > 0 ? (
            <div className="grid gap-3 border-t border-[var(--gen-accent-border)] pt-5 sm:grid-cols-2">
              {items.map((item) => (
                <div key={item.label} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--gen-accent-text)]">
                    {item.label}
                  </p>
                  <div className="text-sm font-medium text-foreground/88 sm:text-base">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {footer ? (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--gen-accent-border)] pt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--gen-accent-text)]">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
