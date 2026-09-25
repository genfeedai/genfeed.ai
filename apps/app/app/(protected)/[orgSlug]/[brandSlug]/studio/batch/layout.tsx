'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import BatchWorkflowPage from '@/features/workflows/pages/batch/BatchWorkflowPage';

export default function StudioBatchLayout({ children }: LayoutProps) {
  return (
    <>
      <BatchWorkflowPage />
      {children}
    </>
  );
}
