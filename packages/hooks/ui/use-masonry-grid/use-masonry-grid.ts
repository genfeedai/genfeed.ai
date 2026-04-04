'use client';

import type {
  IItemPosition,
  IMasonryGridOptions,
} from '@genfeedai/interfaces/components/masonry-grid.interface';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface MasonryItem {
  id?: string;
}

export function useMasonryGrid<T extends MasonryItem>(
  items: T[],
  options: IMasonryGridOptions = {
    columns: { desktop: 4, mobile: 1, tablet: 2 },
    gap: 2,
  },
) {
  const itemsCount = items.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const layoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const layoutAnimationFrameRef = useRef<number | null>(null);
  const gap = useMemo(() => options.gap ?? 16, [options.gap]);
  const layoutSignature = useMemo(() => {
    if (itemsCount === 0) {
      return '0';
    }
    return items.map((item, index) => item.id ?? `idx-${index}`).join('|');
  }, [items, itemsCount]);

  const cancelScheduledLayout = useCallback(() => {
    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current);
      layoutTimeoutRef.current = null;
    }

    if (layoutAnimationFrameRef.current) {
      cancelAnimationFrame(layoutAnimationFrameRef.current);
      layoutAnimationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const columnSettings = useMemo(
    () => ({
      desktop:
        options.columns?.desktop ??
        options.columns?.tablet ??
        options.columns?.mobile ??
        1,
      mobile: options.columns?.mobile ?? 1,
      tablet: options.columns?.tablet ?? options.columns?.mobile ?? 1,
    }),
    [options.columns],
  );

  const getColumnCount = useCallback(() => {
    if (!isClient) {
      return options.columns?.mobile;
    }

    const width = window.innerWidth;
    if (width >= 1024) {
      return columnSettings.desktop;
    }
    if (width >= 640) {
      return columnSettings.tablet;
    }
    return columnSettings.mobile;
  }, [columnSettings, isClient, options.columns?.mobile]);

  const calculateLayout = useCallback(() => {
    if (!containerRef.current || itemsCount === 0 || !isClient) {
      return;
    }
    // Force hook to rerun when underlying item order changes
    void layoutSignature;

    const container = containerRef.current;
    const columnCount = getColumnCount() ?? 1;
    const containerWidth = container.clientWidth;

    if (containerWidth === 0) {
      return; // Wait for container to be sized
    }

    const itemWidth = (containerWidth - (columnCount - 1) * gap) / columnCount;

    // Initialize column heights
    const columnHeights: number[] = new Array(columnCount).fill(0);

    // Get all masonry items
    const masonryItems = Array.from(
      container.querySelectorAll('.masonry-item'),
    ) as HTMLElement[];

    if (masonryItems.length === 0) {
      return;
    }

    const positions: IItemPosition[] = [];

    masonryItems.forEach((item, index) => {
      item.style.width = `${itemWidth}px`;
      const itemHeight = item.scrollHeight || item.offsetHeight;

      // First row: maintain horizontal ordering, subsequent: find shortest column
      const targetColumn =
        index < columnCount
          ? index
          : columnHeights.indexOf(Math.min(...columnHeights));

      const x = targetColumn * (itemWidth + gap);
      const y = columnHeights[targetColumn];

      positions.push({ height: itemHeight, width: itemWidth, x, y });
      columnHeights[targetColumn] += itemHeight + gap;
    });

    container.classList.remove('loading');

    masonryItems.forEach((item, index) => {
      const position = positions[index];
      const shouldAnimate = isLayoutReady && item.style.position === 'absolute';

      item.style.position = 'absolute';
      item.style.left = `${position.x}px`;
      item.style.top = `${position.y}px`;
      item.style.width = `${position.width}px`;
      item.style.transition = shouldAnimate
        ? 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        : 'none';
      item.style.transformOrigin = 'top left';
      item.style.willChange = shouldAnimate ? 'left, top, width' : 'auto';
    });

    const maxHeight = Math.max(...columnHeights) - gap;
    setContainerHeight(Math.max(maxHeight, 200));

    if (!isLayoutReady) {
      setIsLayoutReady(true);
    }
  }, [
    itemsCount,
    layoutSignature,
    gap,
    getColumnCount,
    isClient,
    isLayoutReady,
  ]);

  const scheduleLayout = useCallback(
    (delay: number = 0) => {
      const run = () => {
        layoutAnimationFrameRef.current = requestAnimationFrame(() => {
          calculateLayout();
          layoutAnimationFrameRef.current = null;
        });
      };

      cancelScheduledLayout();

      if (delay > 0) {
        layoutTimeoutRef.current = setTimeout(() => {
          run();
          layoutTimeoutRef.current = null;
        }, delay);
        return;
      }

      run();
    },
    [calculateLayout, cancelScheduledLayout],
  );

  // Layout on items change - only when client is ready
  useEffect(() => {
    if (itemsCount > 0 && isClient) {
      scheduleLayout(100);

      return () => {
        cancelScheduledLayout();
      };
    }
  }, [itemsCount, isClient, scheduleLayout, cancelScheduledLayout]);

  // Layout on window resize with debouncing
  useEffect(() => {
    if (!isClient) {
      return;
    }

    const handleResize = () => {
      scheduleLayout(150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelScheduledLayout();
    };
  }, [scheduleLayout, isClient, cancelScheduledLayout]);

  // Observe container size changes - only after client hydration
  useEffect(() => {
    if (!containerRef.current || !isClient) {
      return;
    }

    resizeObserverRef.current = new ResizeObserver(() => {
      scheduleLayout(50);
    });

    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      cancelScheduledLayout();
    };
  }, [scheduleLayout, isClient, cancelScheduledLayout]);

  // Function to trigger layout recalculation (for image loads) - debounced
  const recalculateLayout = useCallback(() => {
    if (!isClient) {
      return;
    }

    scheduleLayout(120);
  }, [scheduleLayout, isClient]);

  useEffect(() => {
    return () => {
      cancelScheduledLayout();
    };
  }, [cancelScheduledLayout]);

  return {
    containerHeight,
    containerRef,
    isClient,
    isLayoutReady,
    recalculateLayout,
  };
}
