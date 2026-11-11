import { cn } from '@genfeedai/helpers';
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface UnderlineNavItem {
  /** Shown after the label, such as a count. */
  badge?: ReactNode;
  href: string;
  isActive: boolean;
  label: string;
}

export interface UnderlineNavProps {
  ariaLabel: string;
  items: ReadonlyArray<UnderlineNavItem>;
}

/**
 * Page sections as plain links under a divider, the active one underlined.
 * Each section stays its own crawlable URL, so this renders on the server.
 *
 * The underline sits above the divider instead of overlapping it with a
 * negative margin: the overlap made the row one pixel taller than its box,
 * and a scroll container turns that into a vertical scrollbar.
 */
function UnderlineNav({ ariaLabel, items }: UnderlineNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto border-b border-foreground/10"
    >
      {items.map(({ badge, href, isActive, label }) => (
        <Link
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
            isActive
              ? 'border-foreground font-medium text-foreground'
              : 'border-transparent text-foreground/60 hover:text-foreground',
          )}
          href={href}
          key={href}
        >
          {label}
          {badge ? <> {badge}</> : null}
        </Link>
      ))}
    </nav>
  );
}

export { UnderlineNav };
