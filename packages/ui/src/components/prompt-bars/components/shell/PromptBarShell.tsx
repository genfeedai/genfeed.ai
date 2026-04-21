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
        'gen-shell-surface relative shadow-[0_18px_36px_-28px_rgba(0,0,0,0.8)] backdrop-blur-lg transition-[border-color,background-color,box-shadow] focus-within:border-white/16 focus-within:bg-background-tertiary/90 focus-within:shadow-[0_20px_40px_-28px_rgba(0,0,0,0.88)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
