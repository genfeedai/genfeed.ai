'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import type { ReactNode } from 'react';

export interface PublicShellProps {
  children: ReactNode;
  topbar?: ReactNode;
  isTopbarVisible?: boolean;
  mainClassName?: string;
  overlay?: ReactNode;
}

export default function PublicShell({
  children,
  topbar,
  isTopbarVisible = true,
  mainClassName,
  overlay,
}: PublicShellProps) {
  return (
    <ErrorBoundary>
      {overlay}
      {isTopbarVisible ? topbar : null}
      <main
        className={cn(
          'relative z-10 flex min-h-screen flex-col pt-20',
          mainClassName,
        )}
      >
        {children}
      </main>
    </ErrorBoundary>
  );
}
