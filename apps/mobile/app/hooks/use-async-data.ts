import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaginationMeta } from '@/services/api/base-http.service';

export interface UseAsyncDataOptions<TOptions> {
  options?: TOptions;
  enabled?: boolean;
}

export interface UseAsyncDataReturn<TData> {
  data: TData;
  error: Error | null;
  isLoading: boolean;
  isRefreshing: boolean;
  pagination: PaginationMeta | null;
  refetch: (isRefresh?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseAsyncItemReturn<TData> {
  data: TData | null;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

type FetchListFn<TData, TOptions> = (
  token: string,
  options?: TOptions,
  signal?: AbortSignal,
) => Promise<{ data: TData; meta?: { pagination?: PaginationMeta } }>;

type FetchItemFn<TData> = (
  token: string,
  id: string,
  signal?: AbortSignal,
) => Promise<{ data: TData }>;

export function useAsyncList<TData, TOptions = Record<string, unknown>>(
  fetchFn: FetchListFn<TData[], TOptions>,
  resourceName: string,
  config: UseAsyncDataOptions<TOptions> = {},
): UseAsyncDataReturn<TData[]> {
  const { options, enabled = true } = config;
  const { getToken } = useAuth();

  const [data, setData] = useState<TData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetch = useCallback(
    async (isRefresh = false) => {
      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      if (!enabled) {
        setIsLoading(false);
        return;
      }

      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const token = await getToken();
      if (!token) {
        setError(new Error('No authentication token available'));
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const response = await fetchFn(token, optionsRef.current, signal);
        // Only update state if not aborted
        if (!signal.aborted) {
          setData(response.data || []);
          setPagination(response.meta?.pagination || null);
        }
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (!signal.aborted) {
          setError(
            err instanceof Error
              ? err
              : new Error(`Failed to fetch ${resourceName}`),
          );
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [enabled, fetchFn, getToken, resourceName],
  );

  useEffect(() => {
    fetch();

    // Cleanup: abort on unmount
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetch]);

  const refresh = useCallback(() => fetch(true), [fetch]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    pagination,
    refetch: fetch,
    refresh,
  };
}

export function useAsyncItem<TData>(
  fetchFn: FetchItemFn<TData>,
  id: string | null,
  resourceName: string,
): UseAsyncItemReturn<TData> {
  const { getToken } = useAuth();
  const [data, setData] = useState<TData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    if (!id) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError(new Error('No authentication token available'));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetchFn(token, id, signal);
      // Only update state if not aborted
      if (!signal.aborted) {
        setData(response.data);
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (!signal.aborted) {
        setError(
          err instanceof Error
            ? err
            : new Error(`Failed to fetch ${resourceName}`),
        );
      }
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [fetchFn, getToken, id, resourceName]);

  useEffect(() => {
    fetch();

    // Cleanup: abort on unmount
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetch]);

  return {
    data,
    error,
    isLoading,
    refetch: fetch,
  };
}

export function useAsyncAction<TResult = void>() {
  const { getToken } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async <T = TResult>(
      action: (token: string) => Promise<T>,
      errorMessage: string,
    ): Promise<T | null> => {
      setIsSubmitting(true);
      setError(null);

      const token = await getToken();
      if (!token) {
        setError(new Error('No authentication token available'));
        setIsSubmitting(false);
        return null;
      }

      try {
        const result = await action(token);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(errorMessage));
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [getToken],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    clearError,
    error,
    execute,
    isSubmitting,
  };
}
