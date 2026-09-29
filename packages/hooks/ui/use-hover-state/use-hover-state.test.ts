import { useHoverState } from '@hooks/ui/use-hover-state/use-hover-state';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('useHoverState', () => {
  describe('handleMouseEnter', () => {
    it('calls onHoverChange callback with true', () => {
      const onHoverChange = vi.fn();
      const { result } = renderHook(() => useHoverState({ onHoverChange }));

      act(() => {
        result.current.handleMouseEnter();
      });

      expect(onHoverChange).toHaveBeenCalledWith(true);
      expect(onHoverChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMouseLeave', () => {
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
