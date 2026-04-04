'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';

export default function PublicLayout({ children }: LayoutProps) {
  return (
    <ErrorBoundary>
      <main className="min-h-screen flex flex-col">
        <main className="flex-grow">{children}</main>
      </main>
    </ErrorBoundary>
  );
}
