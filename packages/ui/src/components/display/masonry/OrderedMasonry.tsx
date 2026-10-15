'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useMasonryGrid } from '@genfeedai/hooks/ui/use-masonry-grid/use-masonry-grid';
import type { OrderedMasonryProps } from '@genfeedai/props/content/masonry.props';
import { Children, isValidElement, useMemo } from 'react';

const TILE_WIDTH = 240;
const TILE_GAP = 8;
const COLUMNS = { desktop: 5, mobile: 1, tablet: 3 };

/**
 * Hovering (or keyboard-focusing) one tile quietly recedes its siblings. One
 * definition for every grid built on this component (Library, Studio).
 */
const SIBLING_DIM_CLASS =
  '[&>[data-masonry-item]]:transition-opacity [&>[data-masonry-item]]:duration-300 [&>[data-masonry-item]]:ease-out motion-reduce:[&>[data-masonry-item]]:transition-none [@media(hover:hover)]:[&:has(>[data-masonry-item]:hover)>[data-masonry-item]:not(:hover):not(:focus-within)]:opacity-90 [&:has(>[data-masonry-item]_:focus-visible)>[data-masonry-item]:not(:focus-within):not(:hover)]:opacity-90';

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
      className={cn(SIBLING_DIM_CLASS, className)}
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
