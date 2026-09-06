import type { WorkspaceTaskRowsSkeletonProps } from '@props/workspace/workspace-task-loading.props';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';

export function WorkspaceTaskRowsSkeleton({
  rows = 3,
}: WorkspaceTaskRowsSkeletonProps) {
  return (
    <ListRowsSkeleton data-testid="workspace-task-rows-skeleton" rows={rows} />
  );
}
