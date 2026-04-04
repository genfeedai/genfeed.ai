import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounces a value with a specified delay
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Returns a debounced function that delays invoking func until after delay milliseconds
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: DependencyList = [],
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const callbackRef = useRef(callback);

  // Update callback if it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay, ...deps],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * Debounces API calls with abort controller support
 */
export function useDebouncedAPI<
  T extends (...args: unknown[]) => Promise<unknown>,
>(
  apiCall: T,
  delay: number = 300,
): {
  call: (...args: Parameters<T>) => void;
  isLoading: boolean;
  cancel: () => void;
} {
  const [isLoading, setIsLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
  }, []);

  const call = useCallback(
    (...args: Parameters<T>) => {
      // Cancel any pending requests
      cancel();

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      timeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          // Pass abort signal as last argument
          await apiCall(...args, {
            signal: abortControllerRef.current?.signal,
          });
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            throw error;
          }
        } finally {
          setIsLoading(false);
        }
      }, delay);
    },
    [apiCall, delay, cancel],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return { call, cancel, isLoading };
}
