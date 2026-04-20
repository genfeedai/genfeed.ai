import type { DependencyList } from 'react';
import { useEffect } from 'react';

/**
 * useEffect wrapper that automatically handles AbortController cleanup.
 * Eliminates boilerplate for async effects that need cancellation.
 *
 * @example
 * // Before (repeated 15+ times in codebase)
 * useEffect(() => {
 *   const controller = new AbortController();
 *   fetchData(controller.signal);
 *   return () => controller.abort();
 * }, [fetchData]);
 *
 * // After
 * useAbortEffect(fetchData, [fetchData]);
 *
 * @param effect - Async function that receives an AbortSignal
 * @param deps - Dependency array (same as useEffect)
 */
export function useAbortEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps: DependencyList,
): void {
  useEffect(() => {
    const controller = new AbortController();
    effect(controller.signal);
    return () => {
      controller.abort();
    };
  }, deps);
}
