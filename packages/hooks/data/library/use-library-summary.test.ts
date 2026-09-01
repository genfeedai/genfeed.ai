import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getTokenMock.mockResolvedValue('token-123');
    scopeMock.brandId = 'brand-1';
    scopeMock.isReady = true;
    scopeMock.organizationId = 'organization-1';
    scopeMock.pageScope = 'brand';
  });

  it('fetches the Library summary scoped to the active brand', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    const { result } = renderHook(() => useLibrarySummary());

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

  it('sets an error when the response is not ok', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(false, null, 500));

    const { result } = renderHook(() => useLibrarySummary());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toBeNull();
    expect(result.current.error?.message).toContain('500');
  });

  it('waits for the route organization before fetching', async () => {
    scopeMock.organizationId = '';
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    const { rerender } = renderHook(() => useLibrarySummary());

    expect(fetchMock).not.toHaveBeenCalled();

    scopeMock.organizationId = 'organization-1';
    rerender();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('captures a fallback error when the fetch throws a non-Error', async () => {
    fetchMock.mockRejectedValue('boom');

    const { result } = renderHook(() => useLibrarySummary());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'Failed to load library summary',
    );
  });

  it('ignores abort errors on unmount', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    let rejectFetch: ((reason: Error) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );

    const { result, unmount } = renderHook(() => useLibrarySummary());

    unmount();
    rejectFetch?.(abortError);
    await Promise.resolve();

    expect(result.current.error).toBeNull();
  });

  it('refetches when refresh is called', async () => {
    fetchMock.mockResolvedValue(createFetchResponse(true, SUMMARY_PAYLOAD));

    const { result } = renderHook(() => useLibrarySummary());

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
});
