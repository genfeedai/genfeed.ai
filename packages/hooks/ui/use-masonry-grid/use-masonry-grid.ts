'use client';

import type {
  IItemPosition,
  IMasonryGridOptions,
} from '@genfeedai/contracts/interfaces/components/masonry-grid.interface';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveSettledContainerWidth } from './settled-container-width.util';

interface MasonryItem {
  id?: string;
}

/** Where every tile sits at one container width. */
interface ILayoutFrame {
  height: number;
  positions: IItemPosition[];
  width: number;
}

/**
 * A container width that is sweeping from one layout to another (a drawer or
 * rail easing open). Tiles are packed once for each end and follow the sweep.
 */
interface ILayoutTransition {
  from: ILayoutFrame;
  items: HTMLElement[];
  to: ILayoutFrame;
}

/** Hands over once the container stops moving, if the sweep never reports its end. */
const TRANSITION_SETTLE_MS = 250;
const WIDTH_TOLERANCE_PX = 1.5;

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
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
  const layoutFrameRef = useRef<{
    frame: ILayoutFrame;
    items: HTMLElement[];
  } | null>(null);
  const transitionRef = useRef<ILayoutTransition | null>(null);
  const transitionSettleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleLayoutRef = useRef<(delay?: number) => void>(() => undefined);
  // A tile changed size while the sweep owned the layout (media finished
  // loading mid-slide); the settled layout has to be packed again for it.
  const hasDeferredTileResizeRef = useRef(false);
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

  const endTransition = useCallback(() => {
    transitionRef.current = null;
    if (transitionSettleTimeoutRef.current) {
      clearTimeout(transitionSettleTimeoutRef.current);
      transitionSettleTimeoutRef.current = null;
    }
  }, []);

  // Sets every tile to the width the container's columns give it, then packs
  // them. Write every changed width first, then read every height, so the
  // browser lays out once instead of once per tile.
  const measureLayout = useCallback(
    (masonryItems: HTMLElement[], containerWidth: number): ILayoutFrame => {
      const columnCount = getColumnCount(containerWidth) ?? 1;
      const itemWidth =
        (containerWidth - (columnCount - 1) * gap) / columnCount;
      const columnHeights: number[] = new Array(columnCount).fill(0);

      // Measure at the target width, not at wherever a running transition has
      // got to: a tile's height follows its width (aspect-ratio media), so a
      // height read mid-transition packs the next tile into the wrong slot.
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

      return {
        height: Math.max(Math.max(...columnHeights) - gap, 0),
        positions,
        width: containerWidth,
      };
    },
    [gap, getColumnCount],
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

    // A normal pack supersedes any sweep still being followed.
    endTransition();
    hasDeferredTileResizeRef.current = false;

    // Get all masonry items
    const masonryItems = Array.from(
      container.querySelectorAll(':scope > .masonry-item'),
    ) as HTMLElement[];

    if (masonryItems.length === 0) {
      return;
    }

    const isLive = isLiveResizeRef.current;
    isLiveResizeRef.current = false;

    const frame = measureLayout(masonryItems, containerWidth);
    const { positions } = frame;

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

    layoutFrameRef.current = { frame, items: masonryItems };
    // A sweep that stopped short leaves its interpolated height on the node,
    // and React skips the write when the packed height equals the stale state.
    const packedHeight = `${frame.height}px`;
    if (isLayoutReady && container.style.height !== packedHeight) {
      container.style.height = packedHeight;
    }
    setContainerHeight(frame.height);

    if (!isLayoutReady) {
      setIsLayoutReady(true);
    }
  }, [
    itemsCount,
    layoutSignature,
    endTransition,
    isClient,
    isLayoutReady,
    measureLayout,
  ]);

  // Starts following a container width that CSS is easing toward a settled
  // value: packs the destination once so the sweep can be interpolated.
  const beginTransition = useCallback(
    (currentWidth: number): boolean => {
      const container = containerRef.current;
      const previous = layoutFrameRef.current;
      if (!container || !previous || currentWidth === 0) {
        return false;
      }

      const settledWidth = resolveSettledContainerWidth(container);
      if (
        settledWidth === null ||
        Math.abs(settledWidth - currentWidth) < WIDTH_TOLERANCE_PX
      ) {
        return false;
      }

      const items = Array.from(
        container.querySelectorAll(':scope > .masonry-item'),
      ) as HTMLElement[];
      if (
        items.length === 0 ||
        items.length !== previous.items.length ||
        items.some((item, index) => item !== previous.items[index])
      ) {
        return false;
      }

      cancelScheduledLayout();
      isLiveResizeRef.current = false;
      transitionRef.current = {
        from: previous.frame,
        items,
        to: measureLayout(items, settledWidth),
      };
      return true;
    },
    [cancelScheduledLayout, measureLayout],
  );

  // Places every tile for the container's current width along the sweep. Writes
  // only: nothing is measured per frame, so it keeps pace with the drawer.
  const followTransition = useCallback(
    (currentWidth: number, canRetarget = true): boolean => {
      const container = containerRef.current;
      const transition = transitionRef.current;
      if (!container || !transition) {
        return false;
      }

      const { from, items, to } = transition;
      const span = to.width - from.width;
      const rawProgress =
        Math.abs(span) < WIDTH_TOLERANCE_PX
          ? 1
          : (currentWidth - from.width) / span;

      // The width left the sweep: a new transition took over mid-flight.
      if (rawProgress < -0.05 || rawProgress > 1.05) {
        if (!canRetarget || !beginTransition(currentWidth)) {
          endTransition();
          return false;
        }
        return followTransition(currentWidth, false);
      }

      // Another transition can start or change course while this one runs and
      // still end inside the same interval, so the destination is re-read.
      if (canRetarget) {
        const settledWidth = resolveSettledContainerWidth(container);
        if (
          settledWidth !== null &&
          Math.abs(settledWidth - to.width) >= WIDTH_TOLERANCE_PX
        ) {
          if (!beginTransition(currentWidth)) {
            endTransition();
            return false;
          }
          return followTransition(currentWidth, false);
        }
      }

      const isSettled =
        Math.abs(currentWidth - to.width) < WIDTH_TOLERANCE_PX ||
        rawProgress >= 1;
      const progress = isSettled ? 1 : Math.max(rawProgress, 0);
      const appliedPositions = appliedPositionsRef.current;
      const positions = to.positions.map((end, index) => {
        const start = from.positions[index];
        return {
          height: lerp(start.height, end.height, progress),
          width: lerp(start.width, end.width, progress),
          x: lerp(start.x, end.x, progress),
          y: lerp(start.y, end.y, progress),
        };
      });
      const height = lerp(from.height, to.height, progress);

      items.forEach((item, index) => {
        const position = positions[index];
        item.style.position = 'absolute';
        item.style.left = '0px';
        item.style.top = '0px';
        item.style.transition = 'none';
        item.style.width = `${position.width}px`;
        item.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
        appliedPositions.set(item, position);
      });
      container.style.height = `${height}px`;
      layoutFrameRef.current = {
        frame: { height, positions, width: currentWidth },
        items,
      };

      if (isSettled) {
        endTransition();
        setContainerHeight(to.height);
        if (hasDeferredTileResizeRef.current) {
          hasDeferredTileResizeRef.current = false;
          scheduleLayoutRef.current(50);
        }
        return true;
      }

      // The sweep reports every frame it moves. When it stops short of its
      // end, repack normally instead of leaving the tiles half way.
      if (transitionSettleTimeoutRef.current) {
        clearTimeout(transitionSettleTimeoutRef.current);
      }
      transitionSettleTimeoutRef.current = setTimeout(() => {
        transitionSettleTimeoutRef.current = null;
        if (transitionRef.current) {
          transitionRef.current = null;
          scheduleLayoutRef.current(0);
        }
      }, TRANSITION_SETTLE_MS);

      return true;
    },
    [beginTransition, endTransition],
  );

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

  useEffect(() => {
    scheduleLayoutRef.current = scheduleLayout;
  }, [scheduleLayout]);

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
        // A drawer or rail easing open: pack for where it ends and follow it,
        // so tiles scale with the slide instead of jumping between column
        // counts. Anything else (a drag, the window) tracks live.
        const currentWidth = container.clientWidth;
        const isFollowing = transitionRef.current
          ? followTransition(currentWidth)
          : beginTransition(currentWidth) &&
            followTransition(currentWidth, false);
        if (isFollowing) {
          return;
        }

        isLiveResizeRef.current = true;
        scheduleLayout(0);
        return;
      }
      // A frame-synced pass is already queued, or the sweep owns the tiles;
      // a debounce would replace it.
      if (transitionRef.current) {
        hasDeferredTileResizeRef.current = true;
        return;
      }
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
  }, [
    scheduleLayout,
    isClient,
    cancelScheduledLayout,
    beginTransition,
    followTransition,
  ]);

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
      endTransition();
    };
  }, [cancelScheduledLayout, endTransition]);

  return {
    containerHeight,
    containerRef,
    isClient,
    isLayoutReady,
    recalculateLayout,
  };
}
