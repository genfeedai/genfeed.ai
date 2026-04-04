import { useEffect, useState } from 'react';

export interface UseDelayedVisibilityOptions {
  delay?: number;
  enabled?: boolean;
}

/**
 * Hook for delayed visibility animations.
 * Returns true after the specified delay, useful for staggered fade-in effects.
 */
export function useDelayedVisibility(
  options: UseDelayedVisibilityOptions = {},
): boolean {
  const { delay = 0, enabled = true } = options;
  const [visible, setVisible] = useState(delay === 0 && enabled);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    if (delay === 0) {
      setVisible(true);
      return;
    }

    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay, enabled]);

  return visible;
}
