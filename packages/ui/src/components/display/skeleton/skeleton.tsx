import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  SkeletonCardProps,
  SkeletonListProps,
  SkeletonMasonryProps,
  SkeletonProps,
  SkeletonTableProps,
} from '@genfeedai/props/ui/feedback/skeleton.props';
import { Skeleton as ShadcnSkeleton } from '@ui/primitives/skeleton';

type SkeletonVariant = 'circular' | 'rectangular' | 'rounded' | 'text';

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  circular: 'rounded-full',
  rectangular: '',
  rounded: '',
  text: 'rounded',
};

const MASONRY_SKELETON_HEIGHTS = [
  'h-48',
  'h-60',
  'h-72',
  'h-56',
  'h-64',
  'h-80',
  'h-52',
];

function formatDimension(
  value: number | string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'number' ? `${value}px` : value;
}

interface SkeletonRenderItem {
  id: string;
  index: number;
}

// Helper to render repeated skeleton items - reduces duplication
function renderItems(
  count: number,
  prefix: string,
  renderItem: (item: SkeletonRenderItem) => React.ReactNode,
): React.ReactNode[] {
  return Array.from({ length: count }).map((_, index) =>
    renderItem({ id: `${prefix}-${index}`, index }),
  );
}

function SkeletonListItem({ id }: SkeletonRenderItem): React.ReactNode {
  return (
    <div key={id} className="flex items-center gap-x-4">
      <Skeleton variant="circular" width={40} height={40} />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" height={16} className="w-1/3" />
        <Skeleton variant="text" height={14} className="w-2/3" />
      </div>
    </div>
  );
}

/**
 * Enhanced Skeleton component with variant support
 * Uses shadcn Skeleton as base
 */
export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps): React.ReactElement {
  const style = {
    height: formatDimension(height),
    width: formatDimension(width),
  };

  return (
    <ShadcnSkeleton
      className={cn(VARIANT_CLASSES[variant as SkeletonVariant], className)}
      style={style}
    />
  );
}

// Composite skeleton components for common patterns
export function SkeletonCard({
  className,
  label = 'Loading card',
  'data-testid': dataTestId = 'skeleton-card',
  showImage = true,
  showTitle = true,
  showDescription = true,
  showActions = true,
}: SkeletonCardProps) {
  const sections = [showTitle, showDescription, showActions].filter(
    Boolean,
  ).length;
  const minHeight =
    (showImage ? 192 : 0) +
    32 +
    (showTitle ? 24 : 0) +
    (showDescription ? 40 : 0) +
    (showActions ? 36 : 0) +
    Math.max(0, sections - 1) * 12;

  return (
    <ShadcnSkeleton
      aria-label={label}
      className={cn(
        'block w-full rounded-card motion-reduce:animate-none motion-reduce:before:animate-none',
        className,
      )}
      data-testid={dataTestId}
      role="status"
      style={{ minHeight }}
    />
  );
}

export function SkeletonList({ count = 3 }: SkeletonListProps) {
  return (
    <div className="space-y-4">
      {renderItems(count, 'list-item', SkeletonListItem)}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: SkeletonTableProps) {
  // Same card chrome as CardEmpty / AppTable so loading → empty/list does not clip.
  return (
    <div
      aria-busy="true"
      aria-label="Loading table"
      className={cn(
        'relative min-h-[12rem] w-full overflow-hidden rounded-card border border-border bg-card p-4 text-card-foreground',
        className,
      )}
      data-testid="skeleton-table"
      role="status"
    >
      <div className="mb-4 border-b border-border pb-3">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, index) => {
            const columnKey = `header-column-${index}`;

            return (
              <Skeleton
                key={columnKey}
                variant="text"
                height={24}
                className="mr-4"
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => {
          const rowKey = `table-row-${rowIndex}`;

          return (
            <div
              key={rowKey}
              className="grid"
              style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
            >
              {Array.from({ length: columns }).map((_, colIndex) => {
                const cellKey = `${rowKey}-column-${colIndex}`;

                return (
                  <Skeleton
                    key={cellKey}
                    variant="text"
                    height={24}
                    className="mr-4"
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SkeletonMasonryGrid({
  count = 12,
  className,
}: SkeletonMasonryProps) {
  return (
    <div
      className={cn(
        'w-full max-w-full overflow-hidden columns-1 gap-2 space-y-1 md:columns-2 lg:columns-3 xl:columns-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => {
        const height =
          MASONRY_SKELETON_HEIGHTS[index % MASONRY_SKELETON_HEIGHTS.length];
        const masonryKey = `masonry-skeleton-${index}`;

        return (
          <div key={masonryKey} className="break-inside-avoid">
            <Skeleton
              variant="rounded"
              className={cn('w-full rounded-xl', height)}
            />
          </div>
        );
      })}
    </div>
  );
}
