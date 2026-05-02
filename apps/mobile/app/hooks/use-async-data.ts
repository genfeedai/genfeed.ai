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

const AUTH_TOKEN_ERROR = 'No authentication token available';

function getFetchError(err: unknown, fallbackMessage: string): Error {
  return err instanceof Error ? err : new Error(fallbackMessage);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function useRequestSignal() {
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  return useCallback((): AbortSignal => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);
}

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

  const createSignal = useRequestSignal();

  const fetch = useCallback(
    async (isRefresh = false) => {
      const signal = createSignal();

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
        setError(new Error(AUTH_TOKEN_ERROR));
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const response = await fetchFn(token, optionsRef.current, signal);
        if (!signal.aborted) {
          setData(response.data || []);
          setPagination(response.meta?.pagination || null);
        }
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        if (!signal.aborted) {
          setError(getFetchError(err, `Failed to fetch ${resourceName}`));
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [createSignal, enabled, fetchFn, getToken, resourceName],
  );

  useEffect(() => void fetch(), [fetch]);

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

  const createSignal = useRequestSignal();

  const fetch = useCallback(async () => {
    const signal = createSignal();

    if (!id) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError(new Error(AUTH_TOKEN_ERROR));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetchFn(token, id, signal);
      if (!signal.aborted) {
        setData(response.data);
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (!signal.aborted) {
        setError(getFetchError(err, `Failed to fetch ${resourceName}`));
      }
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [createSignal, fetchFn, getToken, id, resourceName]);

  useEffect(() => void fetch(), [fetch]);

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
        setError(new Error(AUTH_TOKEN_ERROR));
        setIsSubmitting(false);
        return null;
      }

      try {
        const result = await action(token);
        return result;
      } catch (err) {
        setError(getFetchError(err, errorMessage));
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
