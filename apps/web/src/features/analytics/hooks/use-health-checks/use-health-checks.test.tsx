import { ServiceHealthStatus } from '@genfeedai/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
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

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useHealthChecks', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient();
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

    const { result } = renderHook(() => useHealthChecks(), { wrapper });

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

    const { result } = renderHook(() => useHealthChecks(), { wrapper });

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

    const { result } = renderHook(() => useHealthChecks(), { wrapper });

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

    const { result } = renderHook(() => useHealthChecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.HEALTHY);
    expect(result.current.isHealthDegraded).toBe(false);
  });

  it('marks services unhealthy when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useHealthChecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    expect(result.current.apiStatus).toBe(ServiceHealthStatus.UNHEALTHY);
    expect(result.current.notificationsStatus).toBe(
      ServiceHealthStatus.UNHEALTHY,
    );
  });

  it.each([ServiceHealthStatus.HEALTHY, ServiceHealthStatus.DEGRADED])(
    'keeps a cached %s result out of a new observer during its first request',
    async (cachedStatus) => {
      fetchMock.mockResolvedValue(
        createFetchResponse({ ok: true, payload: { status: cachedStatus } }),
      );
      const original = renderHook(() => useHealthChecks(), { wrapper });
      await waitFor(() => {
        expect(original.result.current.healthCheckedAt).not.toBeNull();
      });

      let finishCheck!: (response: Response) => void;
      fetchMock.mockReturnValue(
        new Promise<Response>((resolve) => {
          finishCheck = resolve;
        }),
      );
      const current = renderHook(() => useHealthChecks(), { wrapper });

      expect(current.result.current.healthCheckedAt).toBeNull();
      expect(current.result.current.healthAlertMessage).toBeNull();
      expect(original.result.current.apiStatus).toBe(cachedStatus);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      await act(async () => {
        finishCheck(createFetchResponse({ ok: false }));
      });
      await waitFor(() => {
        expect(current.result.current.apiStatus).toBe(
          ServiceHealthStatus.UNHEALTHY,
        );
      });
      expect(current.result.current.healthCheckedAt).not.toBeNull();
    },
  );

  it('preserves the current snapshot while a manual retry is pending', async () => {
    fetchMock.mockResolvedValue(
      createFetchResponse({
        ok: true,
        payload: { status: ServiceHealthStatus.HEALTHY },
      }),
    );

    const { result } = renderHook(() => useHealthChecks(), { wrapper });

    await waitFor(() => {
      expect(result.current.healthCheckedAt).not.toBeNull();
    });

    const checkedAt = result.current.healthCheckedAt;
    let finishCheck!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        finishCheck = resolve;
      }),
    );
    let retry: Promise<void> | undefined;
    act(() => {
      retry = result.current.runHealthChecks();
    });

    expect(result.current.healthCheckedAt).toBe(checkedAt);
    expect(result.current.apiStatus).toBe(ServiceHealthStatus.HEALTHY);
    expect(result.current.healthAlertMessage).toBeNull();

    await act(async () => {
      finishCheck(createFetchResponse({ ok: false }));
      await retry;
    });

    await waitFor(() => {
      expect(result.current.apiStatus).toBe(ServiceHealthStatus.UNHEALTHY);
    });
    expect(result.current.notificationsStatus).toBe(
      ServiceHealthStatus.UNHEALTHY,
    );
  });
});
