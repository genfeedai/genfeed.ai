import { logger } from '@genfeedai/services/core/logger.service';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ContextAuthenticationTokenUnavailableError } from './context-authed-service';

interface UseContextResourceOptions<T> {
  cacheKey?: string;
  cacheTimeMs?: number;
  dependencies?: DependencyList;
  enabled?: boolean;
  initialData?: T | null;
  revalidateOnMount?: boolean;
}

interface UseContextResourceResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  mutate: (nextData: T) => void;
  refresh: () => Promise<void>;
}

interface ContextResourceCacheEntry<T> {
  data?: T;
  promise?: Promise<T>;
  updatedAt: number;
}

const contextResourceCache = new Map<
  string,
  ContextResourceCacheEntry<unknown>
>();

function shallowEqualDependencies(
  a: DependencyList,
  b: DependencyList,
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) {
      continue;
    }

    if (
      typeof a[index] === 'object' &&
      a[index] !== null &&
      typeof b[index] === 'object' &&
      b[index] !== null
    ) {
      const aRecord = a[index] as Record<string, unknown>;
      const bRecord = b[index] as Record<string, unknown>;
      const aKeys = Object.keys(aRecord);
      const bKeys = Object.keys(bRecord);

      if (aKeys.length !== bKeys.length) {
        return false;
      }

      for (const key of aKeys) {
        if (aRecord[key] !== bRecord[key]) {
          return false;
        }
      }

      continue;
    }

    return false;
  }

  return true;
}

function getFreshContextCacheData<T>(
  cacheKey: string | undefined,
  cacheTimeMs: number | undefined,
): T | null {
  if (!cacheKey) {
    return null;
  }

  const entry = contextResourceCache.get(cacheKey);
  if (entry?.data === undefined) {
    return null;
  }

  if (cacheTimeMs !== undefined && Date.now() - entry.updatedAt > cacheTimeMs) {
    contextResourceCache.delete(cacheKey);
    return null;
  }

  return entry.data as T;
}

function setContextCacheData<T>(cacheKey: string | undefined, data: T): void {
  if (!cacheKey) {
    return;
  }

  contextResourceCache.set(cacheKey, {
    data,
    updatedAt: Date.now(),
  });
}

function clearContextCache(cacheKey: string | undefined): void {
  if (!cacheKey) {
    return;
  }

  contextResourceCache.delete(cacheKey);
}

export function useContextResource<T>(
  fetcher: () => Promise<T>,
  options: UseContextResourceOptions<T> = {},
): UseContextResourceResult<T> {
  const {
    cacheKey,
    cacheTimeMs,
    dependencies = [],
    enabled = true,
    initialData = null,
  } = options;

  const initialResolvedDataRef = useRef<T | null>(
    initialData ?? getFreshContextCacheData<T>(cacheKey, cacheTimeMs),
  );
  const revalidateOnMountRef = useRef(
    options.revalidateOnMount ??
      (initialData == null && initialResolvedDataRef.current === null),
  );
  const fetcherRef = useRef(fetcher);
  const isMountedRef = useRef(true);
  const isFirstLoadRef = useRef(true);
  const previousDependenciesRef = useRef<DependencyList>(dependencies);
  const [dependencyVersion, setDependencyVersion] = useState(0);
  const [data, setData] = useState<T | null>(initialResolvedDataRef.current);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(
    enabled &&
      (initialResolvedDataRef.current === null || revalidateOnMountRef.current),
  );

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    if (
      !shallowEqualDependencies(previousDependenciesRef.current, dependencies)
    ) {
      previousDependenciesRef.current = dependencies;
      setDependencyVersion((current) => current + 1);
    }
  });

  useEffect(() => {
    if (!cacheKey || initialResolvedDataRef.current === null) {
      return;
    }

    contextResourceCache.set(cacheKey, {
      data: initialResolvedDataRef.current,
      updatedAt: Date.now(),
    });
  }, [cacheKey]);

  const runFetch = useCallback(
    async (isRefresh = false) => {
      const now = Date.now();
      const cacheEntry = cacheKey
        ? contextResourceCache.get(cacheKey)
        : undefined;
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
        setIsLoading(initialResolvedDataRef.current === null);
        setError(null);

        try {
          const result = (await cacheEntry.promise) as T;
          setContextCacheData(cacheKey, result);

          if (!isMountedRef.current) {
            return;
          }

          setData(result);
        } catch (unknownError) {
          if (
            unknownError instanceof ContextAuthenticationTokenUnavailableError
          ) {
            clearContextCache(cacheKey);
            return;
          }

          clearContextCache(cacheKey);

          if (isMountedRef.current) {
            const resolvedError =
              unknownError instanceof Error
                ? unknownError
                : new Error('useContextResource: fetch failed');

            setError(resolvedError);
            logger.error('useContextResource: fetch failed', {
              error: unknownError,
              reportToSentry: false,
            });
          }
        } finally {
          if (isMountedRef.current) {
            setIsLoading(false);
          }
        }

        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const requestPromise = fetcherRef.current();
        if (cacheKey) {
          contextResourceCache.set(cacheKey, {
            ...cacheEntry,
            promise: requestPromise,
            updatedAt: now,
          });
        }

        const result = await requestPromise;
        setContextCacheData(cacheKey, result);

        if (!isMountedRef.current) {
          return;
        }

        setData(result);
      } catch (unknownError) {
        clearContextCache(cacheKey);

        if (!isMountedRef.current) {
          return;
        }

        if (
          unknownError instanceof ContextAuthenticationTokenUnavailableError
        ) {
          return;
        }

        const resolvedError =
          unknownError instanceof Error
            ? unknownError
            : new Error('useContextResource: fetch failed');

        setError(resolvedError);
        logger.error('useContextResource: fetch failed', {
          error: unknownError,
          reportToSentry: false,
        });
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [cacheKey, cacheTimeMs],
  );

  const refresh = useCallback(async () => {
    await runFetch(true);
  }, [runFetch]);

  const mutate = useCallback(
    (nextData: T) => {
      setData(nextData);

      if (cacheKey) {
        setContextCacheData(cacheKey, nextData);
      }
    },
    [cacheKey],
  );

  useEffect(() => {
    void dependencyVersion;
    isMountedRef.current = true;

    if (!enabled) {
      setIsLoading(false);
      return () => {
        isMountedRef.current = false;
      };
    }

    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;

      if (
        revalidateOnMountRef.current ||
        initialResolvedDataRef.current === null
      ) {
        void runFetch();
      } else {
        setIsLoading(false);
      }
    } else {
      void runFetch();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [dependencyVersion, enabled, runFetch]);

  return {
    data,
    error,
    isLoading,
    mutate,
    refresh,
  };
}
