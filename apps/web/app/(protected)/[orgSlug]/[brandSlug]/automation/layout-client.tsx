'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import { WorkflowRunContextPanel } from '@/features/workflows/workspace/WorkflowRunContextPanel';

export default function AutomationLayout({ children }: LayoutProps) {
  return (
    <>
      <WorkflowRunContextPanel />
      {children}
    </>
  );
}
