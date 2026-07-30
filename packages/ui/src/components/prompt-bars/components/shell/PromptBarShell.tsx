'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Shared surface chrome for Studio generate + Agent chat composers.
 * Keep visual tokens here so both bars stay cousins, not look-alikes by accident.
 */
export const PROMPT_BAR_SURFACE_CLASS =
  'overflow-hidden rounded-2xl border border-white/[0.08] bg-background/55 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150 transition-[border-color,background-color,box-shadow] focus-within:border-white/[0.14] focus-within:bg-background/65';

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
        'relative bg-background transition-[border-color] focus-within:border-white/16',
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
