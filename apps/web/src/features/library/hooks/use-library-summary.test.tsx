import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchLibraryAssetsRefresh } from '@/features/ingredients/hooks/library-assets-refresh';

const getTokenMock = vi.fn();
const fetchMock = vi.fn();
const scopeMock = vi.hoisted(() => ({
  brandId: 'brand-1',
  isReady: true,
  organizationId: 'organization-1',
  pageScope: 'brand' as 'brand' | 'org',
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: scopeMock.brandId,
    isReady: scopeMock.isReady,
    organizationId: scopeMock.organizationId,
  }),
}));

vi.mock('@hooks/navigation/use-page-scope/use-page-scope', () => ({
  usePageScope: () => scopeMock.pageScope,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: getTokenMock }),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.test',
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { useLibrarySummary } from './use-library-summary';

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createFetchResponse(
  ok: boolean,
  payload?: unknown,
  status = 200,
): Response {
  return {
    json: () => Promise.resolve(payload),
    ok,
    status,
  } as unknown as Response;
}

const SUMMARY_PAYLOAD = {
  byCategory: { image: 4 },
  byShelf: {
    approved: 2,
    archived: 0,
    failed: 0,
    generating: 1,
    references: 0,
    rejected: 0,
    'needs-review': 0,
    unsorted: 3,
  },
  starredCount: 1,
  storageBytes: 4096,
  total: 6,
  trashedCount: 0,
};

describe('useLibrarySummary', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    clearRequestOrganizationId();
    vi.stubGlobal('fetch', fetchMock);
    getTokenMock.mockResolvedValue('token-123');
    scopeMock.brandId = 'brand-1';
    scopeMock.isReady = true;
    scopeMock.organizationId = 'organization-1';
    scopeMock.pageScope = 'brand';
  });

  it('fetches the Library summary scoped to the active brand', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toBe(
      'https://api.genfeed.test/ingredients/summary?brandId=brand-1',
    );
    expect(calledInit).toEqual(
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
    expect(result.current.summary).toEqual(SUMMARY_PAYLOAD);
    expect(result.current.error).toBeNull();
  });

  it('counts every brand on the organization Library', async () => {
    scopeMock.pageScope = 'org';
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.genfeed.test/ingredients/summary?allBrands=true',
    );
  });

  it('sends the routed organization header with the bearer token', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));
    setRequestOrganizationId('org-a');

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer token-123',
          [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
        },
      }),
    );
  });

  it('sets an error when the response is not ok', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(false, null, 500));

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toBeNull();
    expect(result.current.error?.message).toContain('500');
  });

  it('waits for the route organization before fetching', async () => {
    scopeMock.organizationId = '';
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    const { rerender } = renderHook(() => useLibrarySummary(), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();

    scopeMock.organizationId = 'organization-1';
    rerender();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('captures a fallback error when the fetch throws a non-Error', async () => {
    fetchMock.mockRejectedValue('boom');

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'Failed to load library summary',
    );
  });

  it('aborts the request on unmount without reporting an error', async () => {
    let requestSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          requestSignal = init?.signal;
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }),
    );

    const { unmount } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(requestSignal).toBeTruthy();
    });
    expect(requestSignal?.aborted).toBe(false);

    unmount();

    await waitFor(() => {
      expect(requestSignal?.aborted).toBe(true);
    });
  });

  it('shows the counts that changed while the first read was pending', async () => {
    const staleSummary = { ...SUMMARY_PAYLOAD, total: 6 };
    const freshSummary = { ...SUMMARY_PAYLOAD, total: 7 };
    let landStaleRead: () => void = () => undefined;
    fetchMock
      .mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise((resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
            landStaleRead = () =>
              resolve(createFetchResponse(true, staleSummary));
          }),
      )
      .mockResolvedValue(createFetchResponse(true, freshSummary));

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      dispatchLibraryAssetsRefresh({ isListRefresh: false });
    });
    // The first read lands late, after the refresh replaced it.
    landStaleRead();

    await waitFor(() => {
      expect(result.current.summary?.total).toBe(7);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('starts a new read without the previous failure on screen', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse(false, null, 500));

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.error?.message).toContain('500');
    });

    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });

  it('refetches when refresh is called', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    const { result } = renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('reloads counts when the list sender already fetched the grid', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    renderHook(() => useLibrarySummary(), { wrapper });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      dispatchLibraryAssetsRefresh({ isListRefresh: false });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
