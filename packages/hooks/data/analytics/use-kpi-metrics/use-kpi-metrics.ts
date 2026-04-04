import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { DependencyList } from 'react';

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

  const resource = useResource(
    async () => {
      const token = await resolveClerkToken(getToken);

      if (!token) {
        throw new Error('No authentication token available');
      }
      return fetcher(token);
    },
    {
      dependencies,
      enabled,
      onError,
      onSuccess,
    },
  );

  return {
    data: resource.data,
    error: resource.error,
    isLoading: resource.isLoading,
    refresh: resource.refresh,
  };
}
