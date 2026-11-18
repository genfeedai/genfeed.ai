'use client';

import { ServiceHealthStatus } from '@genfeedai/contracts';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

const HEALTH_TIMEOUT_MS = 4000;

export interface UseHealthChecksReturn {
  apiStatus: ServiceHealthStatus;
  notificationsStatus: ServiceHealthStatus;
  healthCheckedAt: string | null;
  isHealthDegraded: boolean;
  healthAlertMessage: string | null;
  runHealthChecks: () => Promise<void>;
}

interface HealthSnapshot {
  apiStatus: ServiceHealthStatus;
  checkedAt: string;
  notificationsStatus: ServiceHealthStatus;
}

async function fetchHealthStatus(
  url: string,
  parentSignal: AbortSignal,
): Promise<ServiceHealthStatus> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  const abortWithParent = () => controller.abort();
  parentSignal.addEventListener('abort', abortWithParent);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return ServiceHealthStatus.UNHEALTHY;
    }

    const payload = await response.json().catch(() => null);
    const statusValue =
      typeof payload === 'object' && payload !== null && 'status' in payload
        ? String((payload as Record<string, unknown>).status)
        : null;

    if (statusValue === ServiceHealthStatus.DEGRADED) {
      return ServiceHealthStatus.DEGRADED;
    }

    return ServiceHealthStatus.HEALTHY;
  } catch (_error) {
    return ServiceHealthStatus.UNHEALTHY;
  } finally {
    clearTimeout(timeoutId);
    parentSignal.removeEventListener('abort', abortWithParent);
  }
}

export function useHealthChecks(): UseHealthChecksReturn {
  // Every mount checks again: the status of a minute ago is never shown as the
  // current one, so nothing is kept after the last subscriber leaves.
  const { data, refetch } = useQuery<HealthSnapshot>({
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const [apiStatus, notificationsStatus] = await Promise.all([
        fetchHealthStatus(`${EnvironmentService.apiEndpoint}/health`, signal),
        fetchHealthStatus(`${EnvironmentService.wsEndpoint}/v1/health`, signal),
      ]);

      return {
        apiStatus,
        checkedAt: new Date().toISOString(),
        notificationsStatus,
      };
    },
    queryKey: ['service-health'],
    refetchOnWindowFocus: false,
    retry: false,
  });
  const apiStatus = data?.apiStatus ?? ServiceHealthStatus.HEALTHY;
  const notificationsStatus =
    data?.notificationsStatus ?? ServiceHealthStatus.HEALTHY;
  const healthCheckedAt = data?.checkedAt ?? null;

  const runHealthChecks = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  const isHealthDegraded =
    apiStatus !== ServiceHealthStatus.HEALTHY ||
    notificationsStatus !== ServiceHealthStatus.HEALTHY;

  const healthAlertMessage = useMemo(() => {
    if (!isHealthDegraded) {
      return null;
    }

    const issues: string[] = [];
    if (apiStatus !== ServiceHealthStatus.HEALTHY) {
      issues.push(`API ${apiStatus}`);
    }
    if (notificationsStatus !== ServiceHealthStatus.HEALTHY) {
      issues.push(`Notifications ${notificationsStatus}`);
    }

    return `Service status: ${issues.join(', ')}`;
  }, [apiStatus, isHealthDegraded, notificationsStatus]);

  return {
    apiStatus,
    healthAlertMessage,
    healthCheckedAt,
    isHealthDegraded,
    notificationsStatus,
    runHealthChecks,
  };
}
