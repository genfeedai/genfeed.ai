'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import { ErrorBoundary } from '@ui/error';
import { DesktopGate } from '@/features/workflows/components/DesktopGate';

export default function WorkflowNewLayout({ children }: LayoutProps) {
  return (
    <DesktopGate>
      <ErrorBoundary
        title="Automation Editor Error"
        description="Something went wrong in the automation editor. Please try again."
      >
        {children}
      </ErrorBoundary>
    </DesktopGate>
  );
}
