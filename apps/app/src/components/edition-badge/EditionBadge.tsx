'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { HiOutlineCommandLine } from 'react-icons/hi2';

const EDITION = process.env.NEXT_PUBLIC_GENFEED_EDITION ?? 'Core';

interface EditionBadgeProps {
  className?: string;
}

/**
 * Development-only edition indicator for distinguishing Core vs Cloud shells.
 */
export function EditionBadge({ className }: EditionBadgeProps) {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div
      data-testid="edition-badge"
      className={cn(
        'gen-shell-surface inline-flex select-none items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/62',
        className,
      )}
    >
      <HiOutlineCommandLine className="h-3.5 w-3.5 text-foreground/48" />
      <span>{EDITION}</span>
    </div>
  );
}
