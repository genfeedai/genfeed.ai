import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllMock = vi.fn();
const getServiceMock = vi.fn(async () => ({ findAll: findAllMock }));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getServiceMock,
}));

vi.mock('@genfeedai/services/analytics/creative-patterns.service', () => ({
  CreativePatternsService: {
    getInstance: vi.fn(),
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

import { usePatternContext } from './use-pattern-context';

describe('usePatternContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllMock.mockResolvedValue(
      paginatedResponse([{ label: 'Hook' }], { totalDocs: 51, totalPages: 4 }),
    );
  });

  it('loads patterns from the Nest creative-patterns collection', async () => {
    const { result } = renderHook(() => usePatternContext(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(findAllMock).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1' }),
      { limit: ITEMS_PER_PAGE, page: 1 },
      expect.any(AbortSignal),
    );
    expect(result.current.patterns).toEqual([{ label: 'Hook' }]);
    expect(result.current.error).toBeNull();
    expect(result.current.pageTotals).toEqual({ totalDocs: 51, totalPages: 4 });
  });

  it('passes filters to the collection service', async () => {
    renderHook(
      () =>
        usePatternContext({
          patternType: 'hook_formula',
          platform: 'instagram',
          scope: 'public',
        }),
      { wrapper: queryClientWrapper() },
    );

    await waitFor(() => {
      expect(findAllMock).toHaveBeenCalled();
    });

    expect(findAllMock).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        patternType: 'hook_formula',
        platform: 'instagram',
        scope: 'public',
      },
      { limit: ITEMS_PER_PAGE, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('requests the page it is given and reloads when the page changes', async () => {
    const { rerender } = renderHook(
      ({ page }: { page: number }) => usePatternContext(undefined, page),
      { initialProps: { page: 2 }, wrapper: queryClientWrapper() },
    );

    await waitFor(() => {
      expect(findAllMock).toHaveBeenCalledWith(
        expect.anything(),
        { limit: ITEMS_PER_PAGE, page: 2 },
        expect.any(AbortSignal),
      );
    });

    rerender({ page: 3 });

    await waitFor(() => {
      expect(findAllMock).toHaveBeenCalledWith(
        expect.anything(),
        { limit: ITEMS_PER_PAGE, page: 3 },
        expect.any(AbortSignal),
      );
    });
  });

  it('captures the error message when the fetch fails', async () => {
    findAllMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePatternContext(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('network down');
  });

  it('uses a fallback message for non-error rejections', async () => {
    findAllMock.mockRejectedValue('boom');

    const { result } = renderHook(() => usePatternContext(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load patterns');
  });

  it('ignores abort errors on unmount', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    let rejectFind: ((reason: Error) => void) | undefined;
    findAllMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFind = reject;
        }),
    );

    const { result, unmount } = renderHook(() => usePatternContext(), {
      wrapper: queryClientWrapper(),
    });

    unmount();
    rejectFind?.(abortError);
    await Promise.resolve();

    expect(result.current.error).toBeNull();
  });

  it('paints the cached patterns at once when the page is opened again', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => usePatternContext(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.patterns).toEqual([{ label: 'Hook' }]),
    );
    first.unmount();

    findAllMock.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => usePatternContext(), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.patterns).toEqual([{ label: 'Hook' }]);
    expect(result.current.pageTotals).toEqual({ totalDocs: 51, totalPages: 4 });
  });
});
