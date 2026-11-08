import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Shared plane and border for every composer. The bar sits one step above the
 * canvas (`accent`, gray-200) so it reads against the page without a shadow,
 * a blur or a transition.
 */
export const PROMPT_BAR_SURFACE_CLASS =
  'overflow-hidden rounded-[var(--radius-workspace-composer)] border border-border bg-accent';

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
          // No bg here: callers pass PROMPT_BAR_SURFACE_CLASS or their own fill.
          'relative',
          className,
        )}
      >
        {banner ? (
          <div
            className="border-b border-white/10"
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
