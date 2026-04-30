import { logger } from '@genfeedai/services/core/logger.service';
import { AuthenticationTokenUnavailableError } from '@hooks/auth/use-authed-service/use-authed-service';
import type { DependencyList } from 'react';
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface UseResourceOptions<T, D = T | null> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  notifyOnError?: boolean;
  errorMessage?: string;
  cacheKey?: string;
  cacheTimeMs?: number;
  dependencies?: DependencyList;
  enabled?: boolean;
  initialData?: D;
  revalidateOnMount?: boolean;
  /** Default value to use instead of null. When provided, data will never be null. */
  defaultValue?: D;
}

export interface UseResourceReturn<T> {
  data: T;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  mutate: (newData: T) => void;
}

export interface UseResourceReturnNullable<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  mutate: (newData: T) => void;
}

interface ResourceCacheEntry<T> {
  data?: T;
  promise?: Promise<T>;
  updatedAt: number;
}

const resourceCache = new Map<string, ResourceCacheEntry<unknown>>();

function normalizeResourceError(error: unknown): {
  context?: { error: unknown; reportToSentry: false };
  message: string;
} {
  if (error instanceof Error) {
    const trimmedMessage = error.message.trim();
    return {
      context: { error, reportToSentry: false },
      message: trimmedMessage
        ? `useResource: fetch failed - ${trimmedMessage}`
        : 'useResource: fetch failed',
    };
  }

  if (typeof error === 'string') {
    const trimmedMessage = error.trim();
    return {
      context: { error, reportToSentry: false },
      message: trimmedMessage
        ? `useResource: fetch failed - ${trimmedMessage}`
        : 'useResource: fetch failed',
    };
  }

  return {
    context: { error, reportToSentry: false },
    message: 'useResource: fetch failed',
  };
}

/**
 * Unified data fetching hook
 * Replaces 33+ files with duplicated useEffect + useState patterns
 *
 * Features:
 * - Automatic abort controller management
 * - Loading and refreshing states
 * - Error handling with optional notifications
 * - Manual data mutation
 * - Dependency-based refetching
 * - Conditional fetching with enabled flag
 *
 * @example
 * ```typescript
 * // With defaultValue - data is never null
 * const { data, isLoading, refresh } = useResource(
 *   async () => {
 *     const service = await getArticlesService();
 *     return service.findAll({ brand });
 *   },
 *   {
 *     dependencies: [brandId],
 *     enabled: !!brandId,
 *     defaultValue: []  // data will be Article[], not Article[] | null
 *   }
 * );
 *
 * // Without defaultValue - data can be null
 * const { data, isLoading } = useResource(
 *   async () => fetchSingleItem(),
 *   { dependencies: [id] }
 * );
 * // data is T | null
 * ```
 */
// Overload: with defaultValue, data is never null
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseResourceOptions<T, T> & { defaultValue: T },
): UseResourceReturn<T>;

// Overload: without defaultValue, data can be null
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: UseResourceOptions<T, T | null>,
): UseResourceReturnNullable<T>;

// Implementation
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseResourceOptions<T, T | null> = {},
): UseResourceReturn<T> | UseResourceReturnNullable<T> {
  const {
    onSuccess,
    onError,
    // notifyOnError = false,
    // errorMessage,
    cacheKey,
    cacheTimeMs,
    dependencies = [],
    enabled = true,
    initialData,
    revalidateOnMount = initialData === undefined,
    defaultValue = null,
  } = options;

  // Treat initialData/defaultValue as mount-time hydration input.
  // Callers often pass fresh object literals per render, which must not
  // retrigger the fetch effect after the hook has already initialized.
  const initialResolvedDataRef = useRef(
    (initialData ?? defaultValue) as T | null,
  );
  const resolvedInitialData = initialResolvedDataRef.current;
  const shouldStartLoading =
    enabled && (resolvedInitialData === null || revalidateOnMount);

  const [data, setData] = useState<T | null>(resolvedInitialData);
  const [isLoading, setIsLoading] = useState(shouldStartLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isFirstLoadRef = useRef(true);
  const isMountedRef = useRef(true);

  // Store callbacks in refs to avoid recreating fetchData
  const fetcherRef = useRef(fetcher);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    fetcherRef.current = fetcher;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!cacheKey || resolvedInitialData === null) {
      return;
    }

    resourceCache.set(cacheKey, {
      data: resolvedInitialData,
      updatedAt: Date.now(),
    });
  }, [cacheKey, resolvedInitialData]);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      const now = Date.now();
      const cacheEntry = cacheKey ? resourceCache.get(cacheKey) : undefined;
      const isCacheFresh =
        cacheEntry?.data !== undefined &&
        (cacheTimeMs === undefined ||
          now - cacheEntry.updatedAt <= cacheTimeMs);

      if (!isRefresh && isCacheFresh) {
        setData(cacheEntry.data as T);
        setError(null);
        setIsLoading(false);
        return;
      }

      if (!isRefresh && cacheEntry?.promise) {
        if (initialResolvedDataRef.current === null) {
          setIsLoading(true);
        }

        try {
          const result = (await cacheEntry.promise) as T;
          if (isMountedRef.current) {
            setData(result);
            setError(null);
            setIsLoading(false);
          }
        } catch (err) {
          const error = err as Error;
          if (error.name !== 'AbortError' && isMountedRef.current) {
            setError(error);
            setIsLoading(false);
          }
        }

        return;
      }

      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!isRefresh) {
        setIsLoading(true);
      } else {
        // Defer refreshing state update to avoid render-time updates
        startTransition(() => {
          setIsRefreshing(true);
        });
      }

      setError(null);

      try {
        const requestPromise = fetcherRef.current(controller.signal);
        if (cacheKey) {
          resourceCache.set(cacheKey, {
            ...cacheEntry,
            promise: requestPromise,
            updatedAt: now,
          });
        }

        const result = await requestPromise;

        if (isMountedRef.current && !controller.signal.aborted) {
          setData(result);
          setError(null);
          onSuccessRef.current?.(result);
        }

        if (cacheKey) {
          resourceCache.set(cacheKey, {
            data: result,
            updatedAt: Date.now(),
          });
        }
      } catch (err) {
        const error = err as Error;

        // Ignore abort errors
        if (error.name === 'AbortError') {
          return;
        }

        // Treat auth-not-ready as a deferred fetch, not a user-facing failure.
        if (error instanceof AuthenticationTokenUnavailableError) {
          return;
        }

        if (isMountedRef.current && !controller.signal.aborted) {
          setError(error);

          const normalizedError = normalizeResourceError(err);
          logger.error(normalizedError.message, normalizedError.context);

          onErrorRef.current?.(error);
        }

        if (cacheKey) {
          resourceCache.delete(cacheKey);
        }
      } finally {
        if (isMountedRef.current && !controller.signal.aborted) {
          setIsLoading(false);

          // Defer refreshing state update to avoid render-time updates
          startTransition(() => {
            setIsRefreshing(false);
          });
        }
      }
    },
    [cacheKey, cacheTimeMs],
  ); // stable except cache controls

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const mutate = useCallback(
    (newData: T) => {
      setData(newData);
      if (cacheKey) {
        resourceCache.set(cacheKey, {
          data: newData,
          updatedAt: Date.now(),
        });
      }
    },
    [cacheKey],
  );

  // Shallow comparison utility for dependencies
  const shallowEqual = (a: DependencyList, b: DependencyList): boolean => {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        // For objects/arrays, do shallow comparison
        if (
          typeof a[i] === 'object' &&
          a[i] !== null &&
          typeof b[i] === 'object' &&
          b[i] !== null
        ) {
          const aObj = a[i] as Record<string, unknown>;
          const bObj = b[i] as Record<string, unknown>;
          const aKeys = Object.keys(aObj);
          const bKeys = Object.keys(bObj);

          if (aKeys.length !== bKeys.length) {
            return false;
          }
          for (const key of aKeys) {
            if (aObj[key] !== bObj[key]) {
              return false;
            }
          }
        } else {
          return false;
        }
      }
    }
    return true;
  };

  // Track when dependency values actually change (not just array reference)
  // Use shallow comparison instead of JSON.stringify for better performance
  const prevDepsRef = useRef<DependencyList>(dependencies);
  const [_depsTrigger, setDepsTrigger] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: this hook accepts a caller-provided dependency list and compares its values manually.
  useEffect(() => {
    if (!shallowEqual(prevDepsRef.current, dependencies)) {
      prevDepsRef.current = dependencies;
      setDepsTrigger((prev) => prev + 1);
    }
  }, dependencies);

  // Initial fetch - triggers when dependency values change, not array reference
  useEffect(() => {
    void _depsTrigger;

    // Reset mounted ref when effect runs
    isMountedRef.current = true;

    // Only fetch if enabled
    if (!enabled) {
      setIsLoading(false);
    } else if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;

      if (revalidateOnMount || resolvedInitialData === null) {
        fetchData();
      } else {
        setIsLoading(false);
      }
    } else {
      fetchData();
    }

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [
    fetchData,
    enabled,
    revalidateOnMount,
    resolvedInitialData,
    _depsTrigger,
  ]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    mutate,
    refresh,
  };
}
