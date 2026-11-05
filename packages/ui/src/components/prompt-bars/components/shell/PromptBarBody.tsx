import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes } from 'react';

export interface PromptBarBodyProps extends HTMLAttributes<HTMLDivElement> {
  density?: 'compact' | 'default';
}

/**
 * Shared editor + toolbar inset for every composer surface. The right and the
 * bottom inset are the same value, so the send button sits the same distance
 * from the bar's right edge as from its bottom edge in every prompt bar.
 */
export default function PromptBarBody({
  children,
  className,
  density = 'default',
  ...props
}: PromptBarBodyProps) {
  return (
    <div
      {...props}
      className={cn(
        density === 'compact' ? 'px-2.5 pb-2.5 pt-2' : 'px-3 pb-3 pt-3',
        className,
      )}
      data-testid="prompt-bar-body"
    >
      {children}
    </div>
  );
}
