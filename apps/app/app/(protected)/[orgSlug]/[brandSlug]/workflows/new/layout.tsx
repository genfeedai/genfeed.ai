'use client';

import { DesktopGate } from '@genfeedai/workflow';
import type { LayoutProps } from '@props/layout/layout.props';
import { ErrorBoundary } from '@ui/error';

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
