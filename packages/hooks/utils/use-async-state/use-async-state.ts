import type {
  AsyncState,
  UseAsyncStateOptions,
} from '@genfeedai/interfaces/hooks/use-async-state.interface';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsyncState<T = unknown>(
  initialData: T | null = null,
  options: UseAsyncStateOptions = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(options.initialLoading ?? false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const execute = useCallback(
    async <R = T>(
      asyncFunction: (signal?: AbortSignal) => Promise<R>,
      executeOptions?: {
        isRefresh?: boolean;
        onSuccess?: (data: R) => void;
        onError?: (error: Error) => void;
      },
    ): Promise<R | null> => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (executeOptions?.isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await asyncFunction(abortController.signal);

        if (abortController.signal.aborted) {
          return null;
        }

        if (result !== undefined) {
          setData(result as T);
        }

        executeOptions?.onSuccess?.(result);

        return result;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        executeOptions?.onError?.(error);
        options.onError?.(error);

        return null;
      } finally {
        // Clear loading states
        setIsLoading(false);
        setIsRefreshing(false);

        // Clear abort controller reference if this was the current request
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [options],
  );

  const reset = useCallback(() => {
    setData(initialData);
    setIsLoading(false);
    setIsRefreshing(false);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [initialData]);

  return {
    data,
    error,
    execute,
    isLoading,
    isRefreshing,
    reset,
    setData,
    setError,
    setIsLoading,
    setIsRefreshing,
  };
}
