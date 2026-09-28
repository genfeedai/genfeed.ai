import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CollectionGridProps } from '@genfeedai/props/ui/collection/collection.props';
import {
  COLLECTION_GRID_COLUMN_CLASSES,
  COLLECTION_GRID_GAP_CLASSES,
} from '@ui/collection/collection.constants';

/** Card grid whose columns follow the collection's width, not the viewport. */
export default function CollectionGrid({
  maxColumns = 3,
  density = 'card',
  className,
  children,
  'data-testid': dataTestId,
}: CollectionGridProps) {
  return (
    <div className="@container" data-testid={dataTestId}>
      <div
        className={cn(
          'grid',
          COLLECTION_GRID_COLUMN_CLASSES[maxColumns],
          COLLECTION_GRID_GAP_CLASSES[density],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
