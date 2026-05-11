import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useQuery } from '@tanstack/react-query';
import type { DependencyList } from 'react';
import { useEffect } from 'react';

export interface UseKPIMetricsOptions<T> {
  fetcher: (token: string) => Promise<T>;
  dependencies?: DependencyList;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface UseKPIMetricsReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useKPIMetrics<T>(
  options: UseKPIMetricsOptions<T>,
): UseKPIMetricsReturn<T> {
  const { getToken } = useAuth();

  const {
    fetcher,
    dependencies = [],
    enabled = true,
    onSuccess,
    onError,
  } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['kpi-metrics', ...dependencies],
    queryFn: async () => {
      const token = await resolveClerkToken(getToken);

      if (!token) {
        throw new Error('No authentication token available');
      }
      return fetcher(token);
    },
    enabled,
  });

  useEffect(() => {
    if (data !== undefined && data !== null) {
      onSuccess?.(data);
    }
  }, [data, onSuccess]);

  useEffect(() => {
    if (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [error, onError]);

  return {
    data: data ?? null,
    error:
      error instanceof Error
        ? error
        : error != null
          ? new Error(String(error))
          : null,
    isLoading,
    refresh: async () => {
      await refetch();
    },
  };
}
