import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CollectionListProps } from '@genfeedai/props/ui/collection/collection.props';

/**
 * One card surface holding a column of `ListRow`s. Rows draw their own
 * dividers, so the surface only supplies the plane and the edge.
 */
export default function CollectionList({
  className,
  children,
  'data-testid': dataTestId,
}: CollectionListProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-card bg-card text-card-foreground shadow-border',
        className,
      )}
      data-testid={dataTestId}
    >
      {children}
    </div>
  );
}
