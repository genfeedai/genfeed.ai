import { logger } from '@genfeedai/services/core/logger.service';
import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ContextAuthenticationTokenUnavailableError } from './context-authed-service';

interface UseContextResourceOptions<T> {
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

export function useContextResource<T>(
  fetcher: () => Promise<T>,
  options: UseContextResourceOptions<T> = {},
): UseContextResourceResult<T> {
  const {
    dependencies = [],
    enabled = true,
    initialData = null,
    revalidateOnMount = initialData == null,
  } = options;

  const initialDataRef = useRef(initialData);
  const fetcherRef = useRef(fetcher);
  const isMountedRef = useRef(true);
  const isFirstLoadRef = useRef(true);
  const previousDependenciesRef = useRef<DependencyList>(dependencies);
  const [dependencyVersion, setDependencyVersion] = useState(0);
  const [data, setData] = useState<T | null>(initialDataRef.current);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(
    enabled && (initialDataRef.current === null || revalidateOnMount),
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

  const runFetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current();

      if (!isMountedRef.current) {
        return;
      }

      setData(result);
    } catch (unknownError) {
      if (!isMountedRef.current) {
        return;
      }

      if (unknownError instanceof ContextAuthenticationTokenUnavailableError) {
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
  }, []);

  const refresh = useCallback(async () => {
    await runFetch();
  }, [runFetch]);

  const mutate = useCallback((nextData: T) => {
    setData(nextData);
  }, []);

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

      if (revalidateOnMount || initialDataRef.current === null) {
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
  }, [dependencyVersion, enabled, revalidateOnMount, runFetch]);

  return {
    data,
    error,
    isLoading,
    mutate,
    refresh,
  };
}
