import type { ListRowsSkeletonProps } from '@genfeedai/props/ui/lists/list-row.props';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import type { ReactElement } from 'react';

const ROW_SKELETON_KEYS = [
  'list-row-skeleton-1',
  'list-row-skeleton-2',
  'list-row-skeleton-3',
  'list-row-skeleton-4',
  'list-row-skeleton-5',
  'list-row-skeleton-6',
  'list-row-skeleton-7',
  'list-row-skeleton-8',
] as const;

export function ListRowsSkeleton({
  rows = 3,
  'data-testid': dataTestId = 'list-rows-skeleton',
}: ListRowsSkeletonProps): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="divide-y divide-border/60"
      data-testid={dataTestId}
    >
      {ROW_SKELETON_KEYS.slice(0, rows).map((key) => (
        <div key={key} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
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

export default ListRowsSkeleton;
