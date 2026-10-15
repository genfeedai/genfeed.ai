'use client';

import type {
  IItemPosition,
  IMasonryGridOptions,
} from '@genfeedai/contracts/interfaces/components/masonry-grid.interface';
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
  // The container itself changed width (sidebar, inspector, window). Tiles
  // follow it every frame with no easing; easing a tile that is already
  // being re-packed is what made them lag behind and overlap.
  const isLiveResizeRef = useRef(false);
  const appliedPositionsRef = useRef(new WeakMap<HTMLElement, IItemPosition>());
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

  const getColumnCount = useCallback(
    (containerWidth: number) => {
      if (options.minColumnWidth) {
        return Math.max(
          1,
          Math.min(
            columnSettings.desktop,
            Math.floor((containerWidth + gap) / (options.minColumnWidth + gap)),
          ),
        );
      }

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
    },
    [
      columnSettings,
      gap,
      isClient,
      options.columns?.mobile,
      options.minColumnWidth,
    ],
  );

  const calculateLayout = useCallback(() => {
    if (!containerRef.current || itemsCount === 0 || !isClient) {
      return;
    }
    // Force hook to rerun when underlying item order changes
    void layoutSignature;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;

    if (containerWidth === 0) {
      return; // Wait for container to be sized
    }

    const columnCount = getColumnCount(containerWidth) ?? 1;
    const itemWidth = (containerWidth - (columnCount - 1) * gap) / columnCount;

    // Initialize column heights
    const columnHeights: number[] = new Array(columnCount).fill(0);

    // Get all masonry items
    const masonryItems = Array.from(
      container.querySelectorAll(':scope > .masonry-item'),
    ) as HTMLElement[];

    if (masonryItems.length === 0) {
      return;
    }

    const isLive = isLiveResizeRef.current;
    isLiveResizeRef.current = false;

    // Measure at the target width, not at wherever a running transition has
    // got to: a tile's height follows its width (aspect-ratio media), so a
    // height read mid-transition packs the next tile into the wrong slot.
    // Write every changed width first, then read every height, so the browser
    // lays out once instead of once per tile.
    const targetWidth = `${itemWidth}px`;
    for (const item of masonryItems) {
      if (item.style.width !== targetWidth) {
        item.style.transition = 'none';
        item.style.width = targetWidth;
      }
    }

    const itemHeights = masonryItems.map(
      (item) =>
        item.getBoundingClientRect().height ||
        item.offsetHeight ||
        item.scrollHeight,
    );

    const positions: IItemPosition[] = [];

    itemHeights.forEach((itemHeight, index) => {
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

    // A repack runs whenever any tile changes height (media loading while the
    // user scrolls). Only tiles whose slot changed are touched, and they move
    // by transform: easing left/top forced a layout on every animation frame.
    const appliedPositions = appliedPositionsRef.current;
    masonryItems.forEach((item, index) => {
      const position = positions[index];
      const applied = appliedPositions.get(item);
      if (
        applied &&
        applied.x === position.x &&
        applied.y === position.y &&
        item.style.position === 'absolute'
      ) {
        return;
      }

      const shouldAnimate = !isLive && isLayoutReady && applied !== undefined;

      item.style.position = 'absolute';
      item.style.left = '0px';
      item.style.top = '0px';
      item.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
      // Width is already at its target (set above), so only the slide is eased.
      item.style.transition = shouldAnimate
        ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        : 'none';
      appliedPositions.set(item, position);
    });

    const maxHeight = Math.max(...columnHeights) - gap;
    setContainerHeight(Math.max(maxHeight, 0));

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
    if (itemsCount === 0) {
      cancelScheduledLayout();
      setContainerHeight(0);
      setIsLayoutReady(false);
      return;
    }

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

  // Intrinsic media dimensions can change after loading without a window resize.
  useEffect(() => {
    if (
      !containerRef.current ||
      !isClient ||
      typeof ResizeObserver === 'undefined'
    ) {
      return;
    }

    const container = containerRef.current;
    resizeObserverRef.current = new ResizeObserver((entries) => {
      // The panel the grid lives in resizes (sidebar toggle, inspector): track
      // it frame by frame. Tile size changes (media loading) still debounce.
      if (entries.some((entry) => entry.target === container)) {
        isLiveResizeRef.current = true;
        scheduleLayout(0);
        return;
      }
      // A frame-synced pass is already queued; a debounce would replace it.
      if (isLiveResizeRef.current) {
        return;
      }
      scheduleLayout(50);
    });

    resizeObserverRef.current.observe(container);
    for (const item of container.querySelectorAll(':scope > .masonry-item')) {
      resizeObserverRef.current.observe(item);
    }

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
