import { useMasonryHoverController } from '@hooks/ui/use-masonry-hover-controller/use-masonry-hover-controller';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useMasonryHoverController', () => {
  const createContainerRef = (element: HTMLDivElement | null = null) => ({
    current: element,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('provides all required functions', () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      expect(typeof result.current.registerItem).toBe('function');
      expect(typeof result.current.createHoverChangeHandler).toBe('function');
      expect(typeof result.current.handleGridMouseEnter).toBe('function');
      expect(typeof result.current.handleGridMouseLeave).toBe('function');
    });
  });

  describe('handleGridMouseLeave', () => {
    it('sets isGridHovered to false', () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      act(() => {
        result.current.handleGridMouseEnter();
      });
      expect(result.current.isGridHovered).toBe(true);

      act(() => {
        result.current.handleGridMouseLeave();
      });
      expect(result.current.isGridHovered).toBe(false);
    });
  });

  describe('registerItem', () => {
    it('returns the same callback for the same ingredientId', () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const callback1 = result.current.registerItem('item-1');
      const callback2 = result.current.registerItem('item-1');

      expect(callback1).toBe(callback2);
    });

    it('sets data-hovered attribute when node is registered', () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const callback = result.current.registerItem('item-1');
      const node = document.createElement('div');

      act(() => {
        callback(node);
      });

      expect(node.dataset.hovered).toBe('false');
      expect(node.dataset.dimmed).toBe('false');
    });
  });

  describe('createHoverChangeHandler', () => {
    it('returns the same handler for the same ingredientId', () => {
      const containerRef = createContainerRef();
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const handler1 = result.current.createHoverChangeHandler('item-1');
      const handler2 = result.current.createHoverChangeHandler('item-1');

      expect(handler1).toBe(handler2);
    });
  });

  describe('Container Class Management', () => {
    it('removes is-hovering class when item is unhovered', () => {
      const container = document.createElement('div');
      const containerRef = createContainerRef(container);
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const handler = result.current.createHoverChangeHandler('item-1');

      act(() => {
        handler(true);
        vi.runAllTimers();
      });

      expect(container.classList.contains('is-hovering')).toBe(true);

      act(() => {
        handler(false);
        vi.runAllTimers();
      });

      expect(container.classList.contains('is-hovering')).toBe(false);
    });
  });

  describe('Hover State Transitions', () => {
    it('dims non-hovered items while keeping the hovered item fully visible', () => {
      const container = document.createElement('div');
      const containerRef = createContainerRef(container);
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const itemOne = document.createElement('div');
      const itemTwo = document.createElement('div');

      act(() => {
        result.current.registerItem('item-1')(itemOne);
        result.current.registerItem('item-2')(itemTwo);
      });

      const handler1 = result.current.createHoverChangeHandler('item-1');

      act(() => {
        handler1(true);
        vi.runAllTimers();
      });

      expect(itemOne.dataset.hovered).toBe('true');
      expect(itemOne.dataset.dimmed).toBe('false');
      expect(itemTwo.dataset.hovered).toBe('false');
      expect(itemTwo.dataset.dimmed).toBe('true');
    });

    it('handles hover from one item to another', () => {
      const container = document.createElement('div');
      const containerRef = createContainerRef(container);
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const handler1 = result.current.createHoverChangeHandler('item-1');
      const handler2 = result.current.createHoverChangeHandler('item-2');

      act(() => {
        handler1(true);
        vi.runAllTimers();
      });

      expect(container.dataset.hoveredId).toBe('item-1');

      act(() => {
        handler2(true);
        vi.runAllTimers();
      });

      expect(container.dataset.hoveredId).toBe('item-2');
    });

    it('clears dimming when hover leaves the grid', () => {
      const container = document.createElement('div');
      const containerRef = createContainerRef(container);
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const itemOne = document.createElement('div');
      const itemTwo = document.createElement('div');

      act(() => {
        result.current.registerItem('item-1')(itemOne);
        result.current.registerItem('item-2')(itemTwo);
      });

      const handler1 = result.current.createHoverChangeHandler('item-1');

      act(() => {
        handler1(true);
        vi.runAllTimers();
      });

      act(() => {
        handler1(false);
        vi.runAllTimers();
      });

      expect(itemOne.dataset.dimmed).toBe('false');
      expect(itemTwo.dataset.dimmed).toBe('false');
    });
  });

  describe('Null Container Handling', () => {
    it('handles null container gracefully', () => {
      const containerRef = createContainerRef(null);
      const { result } = renderHook(() =>
        useMasonryHoverController(containerRef),
      );

      const handler = result.current.createHoverChangeHandler('item-1');

      expect(() => {
        act(() => {
          handler(true);
          vi.runAllTimers();
        });
      }).not.toThrow();
    });
  });
});
