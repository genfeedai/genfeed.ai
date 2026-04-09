'use client';

import { ServiceHealthStatus } from '@genfeedai/enums';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { useCallback, useEffect, useMemo, useState } from 'react';

const HEALTH_TIMEOUT_MS = 4000;

export interface UseHealthChecksReturn {
  apiStatus: ServiceHealthStatus;
  notificationsStatus: ServiceHealthStatus;
  healthCheckedAt: string | null;
  isHealthDegraded: boolean;
  healthAlertMessage: string | null;
  runHealthChecks: () => Promise<void>;
}

export function useHealthChecks(): UseHealthChecksReturn {
  const [apiStatus, setApiStatus] = useState<ServiceHealthStatus>(
    ServiceHealthStatus.HEALTHY,
  );
  const [notificationsStatus, setNotificationsStatus] =
    useState<ServiceHealthStatus>(ServiceHealthStatus.HEALTHY);
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);

  const fetchHealthStatus = useCallback(
    async (url: string): Promise<ServiceHealthStatus> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

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

        if (statusValue === ServiceHealthStatus.HEALTHY) {
          return ServiceHealthStatus.HEALTHY;
        }

        if (statusValue === ServiceHealthStatus.DEGRADED) {
          return ServiceHealthStatus.DEGRADED;
        }

        return ServiceHealthStatus.HEALTHY;
      } catch (_error) {
        return ServiceHealthStatus.UNHEALTHY;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [],
  );

  const runHealthChecks = useCallback(async (): Promise<void> => {
    const apiUrl = `${EnvironmentService.apiEndpoint}/health`;
    const notificationsUrl = `${EnvironmentService.wsEndpoint}/v1/health`;

    const [apiResult, notificationsResult] = await Promise.all([
      fetchHealthStatus(apiUrl),
      fetchHealthStatus(notificationsUrl),
    ]);

    setApiStatus(apiResult);
    setNotificationsStatus(notificationsResult);
    setHealthCheckedAt(new Date().toISOString());
  }, [fetchHealthStatus]);

  useEffect(() => {
    runHealthChecks();
  }, [runHealthChecks]);

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
