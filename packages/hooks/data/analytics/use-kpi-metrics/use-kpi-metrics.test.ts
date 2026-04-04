import { useKPIMetrics } from '@hooks/data/analytics/use-kpi-metrics/use-kpi-metrics';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn();
const mockUseResource = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

describe('useKPIMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseResource.mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });
  });

  it('returns data from useResource', () => {
    const refresh = vi.fn();
    mockUseResource.mockReturnValue({
      data: { total: 42 },
      error: null,
      isLoading: true,
      refresh,
    });

    const { result } = renderHook(() =>
      useKPIMetrics({
        fetcher: vi.fn().mockResolvedValue({ total: 42 }),
      }),
    );

    expect(result.current.data).toEqual({ total: 42 });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.refresh).toBe(refresh);
  });

  it('calls fetcher with auth token', async () => {
    const fetcher = vi.fn().mockResolvedValue({ total: 10 });
    mockGetToken.mockResolvedValue('token-123');

    renderHook(() =>
      useKPIMetrics({
        fetcher,
      }),
    );

    const resourceFetcher = mockUseResource.mock
      .calls[0]?.[0] as () => Promise<unknown>;
    await resourceFetcher();

    expect(fetcher).toHaveBeenCalledWith('token-123');
  });

  it('throws when token is missing', async () => {
    const fetcher = vi.fn();
    mockGetToken.mockResolvedValue(null);

    renderHook(() =>
      useKPIMetrics({
        fetcher,
      }),
    );

    const resourceFetcher = mockUseResource.mock
      .calls[0]?.[0] as () => Promise<unknown>;

    await expect(resourceFetcher()).rejects.toThrow(
      'No authentication token available',
    );
  });
});
