import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

/** Shared glass and border for every composer. Flat on purpose: no outer shadow. */
export const PROMPT_BAR_SURFACE_CLASS =
  'overflow-hidden rounded-[var(--radius-workspace-composer)] border border-border-strong/70 bg-background/70 backdrop-blur-xl backdrop-saturate-150 transition-[background-color] focus-within:bg-background/80';

export interface PromptBarShellProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Optional notice pinned inside the shell (model gate, credits, etc.).
   * Prefer this over floating alerts above the bar.
   */
  banner?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Forwards its ref to the shell element: React 18 does not pass `ref` as a prop. */
const PromptBarShell = forwardRef<HTMLDivElement, PromptBarShellProps>(
  function PromptBarShell({ banner, children, className = '', ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
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
  },
);

export default PromptBarShell;
