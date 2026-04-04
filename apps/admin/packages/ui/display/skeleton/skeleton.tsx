import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  SkeletonCardProps,
  SkeletonListProps,
  SkeletonMasonryProps,
  SkeletonProps,
  SkeletonTableProps,
  SkeletonVideoGridProps,
} from '@props/ui/feedback/skeleton.props';
import { Skeleton as ShadcnSkeleton } from '@ui/primitives/skeleton';

type SkeletonVariant = 'circular' | 'rectangular' | 'rounded' | 'text';

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  circular: 'rounded-full',
  rectangular: '',
  rounded: '',
  text: 'rounded',
};

function formatDimension(
  value: number | string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'number' ? `${value}px` : value;
}

// Helper to render repeated skeleton items - reduces duplication
function renderItems<_T>(
  count: number,
  renderItem: (index: number) => React.ReactNode,
): React.ReactNode[] {
  return Array.from({ length: count }).map((_, index) => renderItem(index));
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
  showImage = true,
  showTitle = true,
  showDescription = true,
  showActions = true,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'animate-pulse overflow-hidden rounded border border-white/[0.08] bg-card shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)]',
        className,
      )}
    >
      {showImage && (
        <div className="relative h-48 w-full overflow-hidden">
          <div className="absolute inset-0">
            <Skeleton variant="rounded" className="h-full w-full" />
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {showTitle && <Skeleton variant="text" height={24} className="w-3/4" />}

        {showDescription && (
          <div className="space-y-2">
            <Skeleton variant="text" height={16} className="w-full" />
            <Skeleton variant="text" height={16} className="w-2/3" />
          </div>
        )}

        {showActions && (
          <div className="flex justify-end">
            <Skeleton variant="rounded" width={96} height={36} />
          </div>
        )}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: SkeletonListProps) {
  return (
    <div className="space-y-4">
      {renderItems(count, (index) => (
        <div key={index} className="flex items-center space-x-4">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" height={16} className="w-1/3" />
            <Skeleton variant="text" height={14} className="w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: SkeletonTableProps) {
  return (
    <div className="w-full overflow-hidden rounded border border-white/[0.08] bg-card p-4 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)]">
      <div className="mb-4 border-b border-white/[0.08] pb-3">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} variant="text" height={24} className="mr-4" />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                variant="text"
                height={24}
                className="mr-4"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonVideoGrid({ count = 6 }: SkeletonVideoGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {renderItems(count, (index) => (
        <div key={index} className="space-y-3">
          <Skeleton variant="rounded" className="aspect-video w-full" />
          <div className="flex items-center space-x-2">
            <Skeleton variant="circular" width={32} height={32} />
            <div className="flex-1 space-y-1">
              <Skeleton variant="text" height={14} className="w-3/4" />
              <Skeleton variant="text" height={12} className="w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonMasonryGrid({
  count = 12,
  className,
}: SkeletonMasonryProps) {
  const heights = ['h-48', 'h-60', 'h-72', 'h-56', 'h-64', 'h-80', 'h-52'];

  return (
    <div
      className={cn(
        'w-full max-w-full overflow-hidden columns-1 gap-2 space-y-1 md:columns-2 lg:columns-3 xl:columns-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => {
        const height = heights[index % heights.length];
        return (
          <div key={index} className="break-inside-avoid">
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

export function SkeletonBrandsList({ count = 5 }: SkeletonListProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded border border-white/[0.08] bg-card shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)]"
        >
          <div className="p-4">
            <div className="flex items-center space-x-4">
              <Skeleton variant="circular" width={48} height={48} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" height={16} className="w-1/3" />
                <Skeleton variant="text" height={12} className="w-1/2" />
              </div>

              <div className="space-x-2">
                <Skeleton variant="rounded" width={80} height={32} />
                <Skeleton variant="rounded" width={80} height={32} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonAnalyticsDashboard() {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className=" border border-white/[0.08] bg-white/[0.03] shadow-xl"
          >
            <div className="p-4">
              <Skeleton variant="text" height={14} className="w-1/2" />
              <Skeleton variant="text" height={24} className="w-3/4" />
              <Skeleton variant="text" height={12} className="w-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart Area */}
      <div className=" border border-white/[0.08] bg-white/[0.03] shadow-xl">
        <div className="p-4">
          <Skeleton variant="text" height={20} className="w-1/4 mb-4" />
          <Skeleton variant="rounded" className="w-full h-64" />
        </div>
      </div>
    </div>
  );
}
