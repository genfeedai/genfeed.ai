import type {
  AsyncState,
  UseAsyncStateOptions,
} from '@genfeedai/contracts/interfaces/hooks/use-async-state.interface';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsyncState<T = unknown>(
  initialData: T | null = null,
  options: UseAsyncStateOptions = {},
): AsyncState<T> {
  const { onError } = options;
  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(options.initialLoading ?? false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
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
    ): Promise<R | undefined> => {
      if (!isMountedRef.current) return undefined;
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const ownsRequest = () =>
        abortControllerRef.current === abortController &&
        !abortController.signal.aborted;
      setIsRefreshing(Boolean(executeOptions?.isRefresh));
      setIsLoading(!executeOptions?.isRefresh);
      setError(null);

      try {
        const result = await asyncFunction(abortController.signal);

        if (!ownsRequest()) {
          return undefined;
        }

        if (result !== undefined) {
          setData(result as T);
        }

        executeOptions?.onSuccess?.(result);

        return result;
      } catch (err) {
        if (
          !ownsRequest() ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return undefined;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        executeOptions?.onError?.(error);
        if (ownsRequest()) onError?.(error);

        return undefined;
      } finally {
        if (ownsRequest()) {
          setIsLoading(false);
          setIsRefreshing(false);
          abortControllerRef.current = null;
        }
      }
    },
    [onError],
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
