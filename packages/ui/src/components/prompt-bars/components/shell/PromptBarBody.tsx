import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes } from 'react';

export interface PromptBarBodyProps extends HTMLAttributes<HTMLDivElement> {
  density?: 'compact' | 'default';
}

/** Shared editor + toolbar inset for Agent and Studio composer surfaces. */
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
        density === 'compact' ? 'px-2.5 pb-1 pt-2' : 'px-3.5 pb-1.5 pt-3',
        className,
      )}
      data-testid="prompt-bar-body"
    >
      {children}
    </div>
  );
}
