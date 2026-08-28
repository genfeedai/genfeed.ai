'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Shared surface chrome for Studio generate + Agent chat composers.
 * Keep visual tokens here so both bars stay cousins, not look-alikes by accident.
 */
export const PROMPT_BAR_SURFACE_CLASS =
  'overflow-hidden rounded-[var(--radius-workspace-composer)] bg-background/70 shadow-composer backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow] focus-within:bg-background/80 focus-within:shadow-composer-strong';

export interface PromptBarShellProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Optional notice pinned inside the shell (model gate, credits, etc.).
   * Prefer this over floating alerts above the bar.
   */
  banner?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function PromptBarShell({
  banner,
  children,
  className = '',
  ...props
}: PromptBarShellProps) {
  return (
    <div
      {...props}
      className={cn(
        // No solid bg here — callers pass PROMPT_BAR_SURFACE_CLASS (glass) or
        // their own fill. A hardcoded bg-background painted an opaque black
        // slab behind every agent/studio composer.
        'relative transition-[border-color,background-color,box-shadow]',
        className,
      )}
    >
      {banner ? (
        <div
          className="border-b border-white/[0.08]"
          data-testid="prompt-bar-shell-banner"
        >
          {banner}
        </div>
      ) : null}
      {children}
    </div>
  );
}
