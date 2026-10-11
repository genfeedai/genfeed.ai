import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioPresetListProps } from '@genfeedai/props/studio/studio-presets.props';
import {
  COLLECTION_GRID_COLUMN_CLASSES,
  COLLECTION_GRID_GAP_CLASSES,
} from '@ui/collection/collection.constants';
import type { ReactElement } from 'react';

/** Lays preset cards out as a responsive grid or one scrolling row. */
export default function StudioPresetList({
  ariaLabel,
  children,
  layout = 'grid',
  testId,
}: StudioPresetListProps): ReactElement {
  return (
    <div className="@container">
      <ul
        aria-label={ariaLabel}
        className={cn(
          layout === 'grid'
            ? [
                'grid',
                COLLECTION_GRID_COLUMN_CLASSES[3],
                COLLECTION_GRID_GAP_CLASSES.card,
              ]
            : 'flex snap-x gap-4 overflow-x-auto pb-2',
        )}
        data-testid={testId}
      >
        {children}
      </ul>
    </div>
  );
}
