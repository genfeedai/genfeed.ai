'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes, ReactNode } from 'react';

export interface PromptBarShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export default function PromptBarShell({
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
      {children}
    </div>
  );
}
