import { useKPIMetrics } from '@hooks/data/analytics/use-kpi-metrics/use-kpi-metrics';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn();
const mockResolveClerkToken = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
  }),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: (...args: unknown[]) => mockResolveClerkToken(...args),
}));

describe('useKPIMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClerkToken.mockResolvedValue('mock-token');
  });

  it('returns data from the fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({ total: 42 });

    const { result } = renderHook(() => useKPIMetrics({ fetcher }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ total: 42 });
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe('function');
  });

  it('calls fetcher with resolved auth token', async () => {
    const fetcher = vi.fn().mockResolvedValue({ total: 10 });
    mockResolveClerkToken.mockResolvedValue('token-123');

    const { result } = renderHook(() => useKPIMetrics({ fetcher }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetcher).toHaveBeenCalledWith('token-123');
  });

  it('returns error when token is missing', async () => {
    const fetcher = vi.fn();
    mockResolveClerkToken.mockResolvedValue(null);

    const { result } = renderHook(() => useKPIMetrics({ fetcher }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe(
      'No authentication token available',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns null data before fetch completes', () => {
    // Keep the promise pending so isLoading stays true
    mockResolveClerkToken.mockReturnValue(new Promise(() => {}));
    const fetcher = vi.fn();

    const { result } = renderHook(() => useKPIMetrics({ fetcher }), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('does not fetch when enabled is false', () => {
    const fetcher = vi.fn();

    renderHook(() => useKPIMetrics({ enabled: false, fetcher }), {
      wrapper: createQueryWrapper(),
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(mockResolveClerkToken).not.toHaveBeenCalled();
  });
});
