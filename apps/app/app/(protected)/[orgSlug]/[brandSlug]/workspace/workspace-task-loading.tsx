import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import type { WorkspaceTaskRowsSkeletonProps } from '@/features/workspace/props/workspace-task-loading.props';

export function WorkspaceTaskRowsSkeleton({
  rows = 3,
}: WorkspaceTaskRowsSkeletonProps) {
  return (
    <ListRowsSkeleton data-testid="workspace-task-rows-skeleton" rows={rows} />
  );
}
