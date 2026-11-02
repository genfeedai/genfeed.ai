import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactElement, ReactNode } from 'react';

interface PromptEmptyStateProps {
  title: string;
  description?: string;
  /** Suggested prompt cards, rendered under the description. */
  children?: ReactNode;
  /** Wider cap for three-up suggestion cards (agent full page, playground). */
  isWide?: boolean;
  className?: string;
}

/**
 * The empty state of every prompt-first surface: a centered title and
 * subtitle with suggested prompt cards underneath, sitting in the middle of
 * the content area while the prompt bar stays pinned below it. Agent new
 * conversation and the Studio playground both render it, so the two never
 * drift apart.
 *
 * Fills the nearest positioned ancestor; the cap keeps a tall block scrolling
 * clear of the prompt bar.
 */
export default function PromptEmptyState({
  title,
  description,
  children,
  isWide = false,
  className,
}: PromptEmptyStateProps): ReactElement {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center px-4 md:px-6',
        className,
      )}
      data-testid="prompt-empty-state"
    >
      <div
        className={cn(
          'pointer-events-auto flex max-h-[calc(100%-10rem)] w-full max-w-2xl flex-col items-center gap-5 overflow-y-auto',
          isWide && 'md:max-w-3xl',
        )}
      >
        <div className="w-full text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground md:text-[1.75rem]">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 break-words text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children ? <div className="w-full">{children}</div> : null}
      </div>
    </div>
  );
}
