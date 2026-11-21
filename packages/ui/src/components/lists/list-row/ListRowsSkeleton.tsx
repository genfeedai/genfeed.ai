import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ListRowsSkeletonProps } from '@genfeedai/props/ui/lists/list-row.props';
import { Skeleton } from '@ui/primitives/skeleton';
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

const CONTENT_HEIGHT = {
  // A title line alone, or one that carries a small avatar: 24px.
  single: 'min-h-6',
  // A compact row's title line plus its meta line: 36px.
  default: 'min-h-9',
  // Name, handle and a facts line, as an account row has: 56px.
  tall: 'min-h-14',
  // Rows that lead with a thumbnail and carry detail text: 62px.
  media: 'min-h-[3.875rem]',
} as const;

export function ListRowsSkeleton({
  rows = 3,
  size = 'default',
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
          <div className={cn(CONTENT_HEIGHT[size], 'min-w-0 flex-1 space-y-2')}>
            <Skeleton variant="text" height={14} className="w-3/4" />
            {size === 'single' ? null : (
              <Skeleton variant="text" height={12} className="w-1/2" />
            )}
          </div>
          <Skeleton variant="text" width={48} height={12} />
        </div>
      ))}
    </div>
  );
}

export default ListRowsSkeleton;
