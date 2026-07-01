'use client';

import { Skeleton } from '@ui/display/skeleton/skeleton';

const TASK_ROW_SKELETON_KEYS = [
  'workspace-task-row-skeleton-1',
  'workspace-task-row-skeleton-2',
  'workspace-task-row-skeleton-3',
  'workspace-task-row-skeleton-4',
  'workspace-task-row-skeleton-5',
  'workspace-task-row-skeleton-6',
] as const;

interface WorkspaceTaskRowsSkeletonProps {
  rows?: number;
}

export function WorkspaceTaskRowsSkeleton({
  rows = 3,
}: WorkspaceTaskRowsSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className="divide-y divide-white/[0.06]"
      data-testid="workspace-task-rows-skeleton"
    >
      {TASK_ROW_SKELETON_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="flex items-center gap-3 py-3">
          <Skeleton variant="circular" width={8} height={8} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton variant="text" height={14} className="w-3/4" />
            <Skeleton variant="text" height={12} className="w-1/2" />
          </div>
          <Skeleton variant="text" width={48} height={12} />
        </div>
      ))}
    </div>
  );
}
