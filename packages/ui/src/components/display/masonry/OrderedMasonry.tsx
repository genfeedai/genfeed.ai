'use client';

import { useMasonryGrid } from '@genfeedai/hooks/ui/use-masonry-grid/use-masonry-grid';
import type { OrderedMasonryProps } from '@genfeedai/props/content/masonry.props';
import { Children, isValidElement, useMemo } from 'react';

const TILE_WIDTH = 240;
const TILE_GAP = 8;
const COLUMNS = { desktop: 5, mobile: 1, tablet: 3 };

/** Keep source and keyboard order while packing mixed native media heights. */
export default function OrderedMasonry({
  children,
  className,
}: OrderedMasonryProps): React.ReactElement {
  const tiles = useMemo(
    () =>
      Children.toArray(children).map((child, index) => ({
        child,
        id:
          isValidElement(child) && child.key !== null
            ? child.key
            : String(index),
      })),
    [children],
  );
  const { containerHeight, containerRef, isLayoutReady } = useMasonryGrid(
    tiles,
    {
      columns: COLUMNS,
      gap: TILE_GAP,
      minColumnWidth: TILE_WIDTH,
    },
  );

  return (
    <div
      ref={containerRef}
      className={className}
      data-masonry-layout="ordered"
      style={{
        display: isLayoutReady ? 'block' : 'grid',
        gap: TILE_GAP,
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${TILE_WIDTH}px), 1fr))`,
        height: isLayoutReady ? containerHeight : undefined,
        position: 'relative',
        width: '100%',
      }}
    >
      {tiles.map(({ child, id }) => (
        <div key={id} className="masonry-item min-w-0" data-masonry-item={id}>
          {child}
        </div>
      ))}
    </div>
  );
}
