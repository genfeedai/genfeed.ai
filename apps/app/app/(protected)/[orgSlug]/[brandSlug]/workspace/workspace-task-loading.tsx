'use client';

import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';

interface WorkspaceTaskRowsSkeletonProps {
  rows?: number;
}

export function WorkspaceTaskRowsSkeleton({
  rows = 3,
}: WorkspaceTaskRowsSkeletonProps) {
  return (
    <ListRowsSkeleton data-testid="workspace-task-rows-skeleton" rows={rows} />
  );
}
