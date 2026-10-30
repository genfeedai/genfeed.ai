import { ServiceHealthStatus } from '@genfeedai/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHealthChecks } from './use-health-checks';

interface MockHealthResponse {
  ok: boolean;
  payload?: unknown;
  isJsonBroken?: boolean;
}

function createFetchResponse(response: MockHealthResponse): Response {
  return {
    json: response.isJsonBroken
      ? () => Promise.reject(new Error('invalid json'))
      : () => Promise.resolve(response.payload),
    ok: response.ok,
  } as unknown as Response;
}

describe('useHealthChecks', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports healthy services when both endpoints return healthy', async () => {
    fetchMock.mockResolvedValue(
      createFetchResponse({
        ok: true,
        payload: { status: ServiceHealthStatus.HEALTHY },
      }),
    );

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.HEALTHY);
    expect(result.current.notificationsStatus).toBe(
      ServiceHealthStatus.HEALTHY,
    );
    expect(result.current.isHealthDegraded).toBe(false);
    expect(result.current.healthAlertMessage).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks a service unhealthy on a non-ok response', async () => {
    fetchMock
      .mockResolvedValueOnce(createFetchResponse({ ok: false }))
      .mockResolvedValueOnce(
        createFetchResponse({
          ok: true,
          payload: { status: ServiceHealthStatus.HEALTHY },
        }),
      );

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.UNHEALTHY);
    expect(result.current.isHealthDegraded).toBe(true);
    expect(result.current.healthAlertMessage).toBe(
      `Service status: API ${ServiceHealthStatus.UNHEALTHY}`,
    );
  });

  it('reports degraded status from the payload', async () => {
    fetchMock.mockResolvedValue(
      createFetchResponse({
        ok: true,
        payload: { status: ServiceHealthStatus.DEGRADED },
      }),
    );

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.DEGRADED);
    expect(result.current.notificationsStatus).toBe(
      ServiceHealthStatus.DEGRADED,
    );
    expect(result.current.healthAlertMessage).toBe(
      `Service status: API ${ServiceHealthStatus.DEGRADED}, Notifications ${ServiceHealthStatus.DEGRADED}`,
    );
  });

  it('defaults to healthy when the payload cannot be parsed', async () => {
    fetchMock.mockResolvedValue(
      createFetchResponse({ isJsonBroken: true, ok: true }),
    );

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.HEALTHY);
    expect(result.current.isHealthDegraded).toBe(false);
  });

  it('marks services unhealthy when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.UNHEALTHY);
    expect(result.current.notificationsStatus).toBe(
      ServiceHealthStatus.UNHEALTHY,
    );
  });

  it('re-runs checks when runHealthChecks is called again', async () => {
    fetchMock.mockResolvedValue(
      createFetchResponse({
        ok: true,
        payload: { status: ServiceHealthStatus.HEALTHY },
      }),
    );

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    fetchMock.mockResolvedValue(createFetchResponse({ ok: false }));

    await act(async () => {
      await result.current.runHealthChecks();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.UNHEALTHY);
    expect(result.current.notificationsStatus).toBe(
      ServiceHealthStatus.UNHEALTHY,
    );
  });
});
