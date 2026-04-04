'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import ElementsProvider from '@providers/elements/elements.provider';
import PromptBarProvider from '@providers/promptbar/promptbar.provider';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';

export default function PublicProfileLayout({ children }: LayoutProps) {
  return (
    <ErrorBoundary>
      <ElementsProvider>
        <PromptBarProvider>
          <main className="min-h-screen flex flex-col">
            <main className="flex-grow">{children}</main>
          </main>
        </PromptBarProvider>
      </ElementsProvider>
    </ErrorBoundary>
  );
}
