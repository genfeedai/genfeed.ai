import type { ReactNode } from 'react';

export type WorkspaceSnapshotSummaryItem = {
  label: string;
  value: string;
};

export type WorkspaceSnapshotSectionProps = {
  actions?: ReactNode;
  isLoading?: boolean;
  summaryItems: WorkspaceSnapshotSummaryItem[];
};
