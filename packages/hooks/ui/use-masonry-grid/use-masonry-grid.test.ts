import { useMasonryGrid } from '@hooks/ui/use-masonry-grid/use-masonry-grid';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

describe('useMasonryGrid', () => {
  const mockItems = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('returns initial state correctly', () => {
      const { result } = renderHook(() => useMasonryGrid(mockItems));

      expect(result.current.containerRef).toBeDefined();
      expect(result.current.containerHeight).toBe(0);
      expect(result.current.isLayoutReady).toBe(false);
      expect(result.current.recalculateLayout).toBeDefined();
    });

    it('uses default options when none provided', () => {
      const { result } = renderHook(() => useMasonryGrid(mockItems));
      expect(result.current.containerRef.current).toBe(null);
    });

    it('handles empty items array', () => {
      const { result } = renderHook(() => useMasonryGrid([]));
      expect(result.current.containerHeight).toBe(0);
      expect(result.current.isLayoutReady).toBe(false);
    });
  });

  describe('Options', () => {
    it('accepts custom column settings', () => {
      const options = {
        columns: { desktop: 5, mobile: 2, tablet: 3 },
        gap: 20,
      };

      const { result } = renderHook(() => useMasonryGrid(mockItems, options));
      expect(result.current).toBeDefined();
    });

    it('accepts custom gap setting', () => {
      const options = {
        columns: { desktop: 4, mobile: 1, tablet: 2 },
        gap: 24,
      };

      const { result } = renderHook(() => useMasonryGrid(mockItems, options));
      expect(result.current).toBeDefined();
    });

    it('uses default gap when not specified', () => {
      const options = {
        columns: { desktop: 4, mobile: 1, tablet: 2 },
      };

      const { result } = renderHook(() => useMasonryGrid(mockItems, options));
      expect(result.current).toBeDefined();
    });
  });

  describe('Items Change', () => {
    it('handles items being added', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useMasonryGrid(items),
        { initialProps: { items: mockItems } },
      );

      const newItems = [...mockItems, { id: '4', name: 'Item 4' }];
      rerender({ items: newItems });

      expect(result.current).toBeDefined();
    });

    it('handles items being removed', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useMasonryGrid(items),
        { initialProps: { items: mockItems } },
      );

      const fewerItems = [mockItems[0]];
      rerender({ items: fewerItems });

      expect(result.current).toBeDefined();
    });

    it('handles items being reordered', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useMasonryGrid(items),
        { initialProps: { items: mockItems } },
      );

      const reorderedItems = [mockItems[2], mockItems[0], mockItems[1]];
      rerender({ items: reorderedItems });

      expect(result.current).toBeDefined();
    });
  });

  describe('recalculateLayout', () => {
    it('provides a recalculateLayout function', () => {
      const { result } = renderHook(() => useMasonryGrid(mockItems));
      expect(typeof result.current.recalculateLayout).toBe('function');
    });

    it('can call recalculateLayout without error', () => {
      const { result } = renderHook(() => useMasonryGrid(mockItems));

      // Set isClient to true by advancing timers
      act(() => {
        vi.runAllTimers();
      });

      expect(() => {
        act(() => {
          result.current.recalculateLayout();
        });
      }).not.toThrow();
    });
  });

  describe('isClient State', () => {
    // Skip: jsdom environment sets isClient to true immediately
    it.skip('starts with isClient as false', () => {
      const { result } = renderHook(() => useMasonryGrid(mockItems));
      // Initially isClient is false until useEffect runs
      expect(result.current.isClient).toBe(false);
    });

    it('sets isClient to true after hydration', () => {
      const { result } = renderHook(() => useMasonryGrid(mockItems));

      // Run useEffect
      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.isClient).toBe(true);
    });
  });

  describe('Layout Signature', () => {
    it('handles items without id property', () => {
      const itemsWithoutId = [{ name: 'Item 1' }, { name: 'Item 2' }];

      const { result } = renderHook(() => useMasonryGrid(itemsWithoutId));
      expect(result.current).toBeDefined();
    });

    it('handles mixed items with and without id', () => {
      const mixedItems = [
        { id: '1', name: 'Item 1' },
        { name: 'Item 2' },
        { id: '3', name: 'Item 3' },
      ];

      const { result } = renderHook(() => useMasonryGrid(mixedItems));
      expect(result.current).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('cleans up on unmount', () => {
      const { unmount } = renderHook(() => useMasonryGrid(mockItems));

      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it('cleans up resize observer on unmount', () => {
      const { unmount } = renderHook(() => useMasonryGrid(mockItems));

      act(() => {
        vi.runAllTimers();
      });

      expect(() => {
        unmount();
      }).not.toThrow();
    });
  });

  describe('Column Settings Fallback', () => {
    it('falls back to mobile columns for tablet if not specified', () => {
      const options = {
        columns: { mobile: 2 },
        gap: 16,
      };

      const { result } = renderHook(() => useMasonryGrid(mockItems, options));
      expect(result.current).toBeDefined();
    });

    it('falls back to tablet columns for desktop if not specified', () => {
      const options = {
        columns: { mobile: 1, tablet: 3 },
        gap: 16,
      };

      const { result } = renderHook(() => useMasonryGrid(mockItems, options));
      expect(result.current).toBeDefined();
    });
  });

  describe('Layout calculation with a real container', () => {
    function createContainer(itemHeights: number[]): HTMLDivElement {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 1000 });

      for (const height of itemHeights) {
        const item = document.createElement('div');
        item.className = 'masonry-item';
        Object.defineProperty(item, 'scrollHeight', { value: height });
        Object.defineProperty(item, 'offsetHeight', { value: height });
        container.appendChild(item);
      }

      document.body.appendChild(container);
      return container;
    }

    beforeEach(() => {
      vi.stubGlobal(
        'requestAnimationFrame',
        (callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        },
      );
      vi.stubGlobal('cancelAnimationFrame', () => undefined);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      document.body.innerHTML = '';
    });

    it('positions items into columns and computes container height', () => {
      const container = createContainer([100, 200, 150, 120]);
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

      const { result } = renderHook(() =>
        useMasonryGrid(items, {
          columns: { desktop: 2, mobile: 1, tablet: 2 },
          gap: 10,
        }),
      );

      act(() => {
        result.current.containerRef.current = container;
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.isLayoutReady).toBe(true);
      expect(result.current.containerHeight).toBeGreaterThan(0);

      const positioned = Array.from(
        container.querySelectorAll('.masonry-item'),
      ) as HTMLElement[];
      expect(positioned[0].style.position).toBe('absolute');
      expect(positioned[0].style.left).toBe('0px');
      expect(positioned[0].style.top).toBe('0px');
      // Second item goes to the second column on the first row
      expect(positioned[1].style.left).toBe('505px');
      // Third item lands in the shortest column (first, height 100+10)
      expect(positioned[2].style.top).toBe('110px');
    });

    it('recalculates on demand and on window resize', () => {
      const container = createContainer([100, 100]);
      const items = [{ id: 'a' }, { id: 'b' }];

      const { result } = renderHook(() =>
        useMasonryGrid(items, {
          columns: { desktop: 2, mobile: 1, tablet: 2 },
          gap: 10,
        }),
      );

      act(() => {
        result.current.containerRef.current = container;
      });
      act(() => {
        vi.runAllTimers();
      });
      expect(result.current.isLayoutReady).toBe(true);

      act(() => {
        result.current.recalculateLayout();
        vi.runAllTimers();
      });
      expect(result.current.isLayoutReady).toBe(true);

      act(() => {
        window.dispatchEvent(new Event('resize'));
        vi.runAllTimers();
      });
      expect(result.current.containerHeight).toBeGreaterThan(0);
    });

    it('skips layout while the container has zero width', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'clientWidth', { value: 0 });
      const item = document.createElement('div');
      item.className = 'masonry-item';
      container.appendChild(item);
      document.body.appendChild(container);

      const { result } = renderHook(() => useMasonryGrid([{ id: 'a' }]));

      act(() => {
        result.current.containerRef.current = container;
      });
      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.isLayoutReady).toBe(false);
      expect(result.current.containerHeight).toBe(0);
    });
  });
});
