import { useHoverState } from '@hooks/ui/use-hover-state/use-hover-state';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('useHoverState', () => {
  describe('Initial State', () => {
    it('returns isHovered as false by default', () => {
      const { result } = renderHook(() => useHoverState());
      expect(result.current.isHovered).toBe(false);
    });

    it('respects custom initial value', () => {
      const { result } = renderHook(() =>
        useHoverState({ initialValue: true }),
      );
      expect(result.current.isHovered).toBe(true);
    });

    it('returns all required handlers', () => {
      const { result } = renderHook(() => useHoverState());
      expect(result.current.handleMouseEnter).toBeDefined();
      expect(result.current.handleMouseLeave).toBeDefined();
      expect(result.current.setIsHovered).toBeDefined();
    });
  });

  describe('handleMouseEnter', () => {
    it('sets isHovered to true', () => {
      const { result } = renderHook(() => useHoverState());

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(result.current.isHovered).toBe(true);
    });

    it('calls onHoverChange callback with true', () => {
      const onHoverChange = vi.fn();
      const { result } = renderHook(() => useHoverState({ onHoverChange }));

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(onHoverChange).toHaveBeenCalledWith(true);
      expect(onHoverChange).toHaveBeenCalledTimes(1);
    });

    it('works without onHoverChange callback', () => {
      const { result } = renderHook(() => useHoverState());

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(result.current.isHovered).toBe(true);
    });
  });

  describe('handleMouseLeave', () => {
    it('sets isHovered to false', () => {
      const { result } = renderHook(() =>
        useHoverState({ initialValue: true }),
      );

      act(() => {
        result.current.handleMouseLeave();
      });

      expect(result.current.isHovered).toBe(false);
    });

    it('calls onHoverChange callback with false', () => {
      const onHoverChange = vi.fn();
      const { result } = renderHook(() =>
        useHoverState({ initialValue: true, onHoverChange }),
      );

      act(() => {
        result.current.handleMouseLeave();
      });

      expect(onHoverChange).toHaveBeenCalledWith(false);
      expect(onHoverChange).toHaveBeenCalledTimes(1);
    });

    it('works without onHoverChange callback', () => {
      const { result } = renderHook(() =>
        useHoverState({ initialValue: true }),
      );

      act(() => {
        result.current.handleMouseLeave();
      });

      expect(result.current.isHovered).toBe(false);
    });
  });

  describe('setIsHovered', () => {
    it('allows direct setting of hover state to true', () => {
      const { result } = renderHook(() => useHoverState());

      act(() => {
        result.current.setIsHovered(true);
      });

      expect(result.current.isHovered).toBe(true);
    });

    it('allows direct setting of hover state to false', () => {
      const { result } = renderHook(() =>
        useHoverState({ initialValue: true }),
      );

      act(() => {
        result.current.setIsHovered(false);
      });

      expect(result.current.isHovered).toBe(false);
    });
  });

  describe('Handler Stability', () => {
    it('handleMouseEnter is stable between renders', () => {
      const { result, rerender } = renderHook(() => useHoverState());
      const firstHandler = result.current.handleMouseEnter;

      rerender();

      expect(result.current.handleMouseEnter).toBe(firstHandler);
    });

    it('handleMouseLeave is stable between renders', () => {
      const { result, rerender } = renderHook(() => useHoverState());
      const firstHandler = result.current.handleMouseLeave;

      rerender();

      expect(result.current.handleMouseLeave).toBe(firstHandler);
    });

    it('handlers change when onHoverChange changes', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const { result, rerender } = renderHook(
        ({ onHoverChange }) => useHoverState({ onHoverChange }),
        { initialProps: { onHoverChange: callback1 } },
      );

      const firstEnterHandler = result.current.handleMouseEnter;

      rerender({ onHoverChange: callback2 });

      expect(result.current.handleMouseEnter).not.toBe(firstEnterHandler);
    });
  });

  describe('Integration', () => {
    it('handles hover enter then leave sequence', () => {
      const onHoverChange = vi.fn();
      const { result } = renderHook(() => useHoverState({ onHoverChange }));

      act(() => {
        result.current.handleMouseEnter();
      });
      expect(result.current.isHovered).toBe(true);
      expect(onHoverChange).toHaveBeenLastCalledWith(true);

      act(() => {
        result.current.handleMouseLeave();
      });
      expect(result.current.isHovered).toBe(false);
      expect(onHoverChange).toHaveBeenLastCalledWith(false);

      expect(onHoverChange).toHaveBeenCalledTimes(2);
    });

    it('handles multiple enter/leave cycles', () => {
      const { result } = renderHook(() => useHoverState());

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.handleMouseEnter();
        });
        expect(result.current.isHovered).toBe(true);

        act(() => {
          result.current.handleMouseLeave();
        });
        expect(result.current.isHovered).toBe(false);
      }
    });

    it('handles options being undefined', () => {
      const { result } = renderHook(() => useHoverState(undefined));
      expect(result.current.isHovered).toBe(false);

      act(() => {
        result.current.handleMouseEnter();
      });
      expect(result.current.isHovered).toBe(true);
    });
  });
});
