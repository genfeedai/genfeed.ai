import { useCallback, useState } from 'react';

export interface UseHoverStateReturn {
  isHovered: boolean;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  setIsHovered: (value: boolean) => void;
}

export interface UseHoverStateOptions {
  /** Initial hover state. Default: false */
  initialValue?: boolean;
  /** Callback when hover state changes */
  onHoverChange?: (isHovered: boolean) => void;
}

/**
 * Hook to manage hover state with memoized handlers.
 * Extracts the repeated hover state pattern used across 40+ components.
 *
 * @param options - Optional configuration
 * @returns Hover state and handlers
 *
 * @example
 * ```tsx
 * const { isHovered, handleMouseEnter, handleMouseLeave } = useHoverState();
 *
 * return (
 *   <div
 *     onMouseEnter={handleMouseEnter}
 *     onMouseLeave={handleMouseLeave}
 *     className={isHovered ? 'bg-primary' : 'bg-card'}
 *   >
 *     Hover me
 *   </div>
 * );
 * ```
 *
 * @example
 * ```tsx
 * // With callback
 * const { isHovered, handleMouseEnter, handleMouseLeave } = useHoverState({
 *   onHoverChange: (hovered) => console.log('Hover changed:', hovered),
 * });
 * ```
 */
export function useHoverState(
  options?: UseHoverStateOptions,
): UseHoverStateReturn {
  const { initialValue = false, onHoverChange } = options ?? {};
  const [isHovered, setIsHovered] = useState(initialValue);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    onHoverChange?.(true);
  }, [onHoverChange]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    onHoverChange?.(false);
  }, [onHoverChange]);

  return {
    handleMouseEnter,
    handleMouseLeave,
    isHovered,
    setIsHovered,
  };
}
