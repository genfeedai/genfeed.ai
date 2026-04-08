'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
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
        'relative border border-white/10 bg-[#151515]/88 shadow-[0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-lg transition-[border-color,background-color,box-shadow] focus-within:border-white/16 focus-within:bg-[#171717]/92 focus-within:shadow-[0_14px_34px_rgba(0,0,0,0.28)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
