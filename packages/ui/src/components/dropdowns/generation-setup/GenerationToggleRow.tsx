'use client';

import type { GenerationToggleRowProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';

/**
 * One Brand-popover row: label on the left, control on the right in a
 * fixed-width column so every row's control lines up and has the same size.
 */
export default function GenerationToggleRow({
  children,
  label,
  leading,
}: GenerationToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
        {leading}
        {label}
      </span>
      <div className="w-44 shrink-0">{children}</div>
    </div>
  );
}
