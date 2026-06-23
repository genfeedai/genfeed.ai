// @vitest-environment jsdom
'use client';

import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const getPlaywrightAuthStateMock = vi.fn();
const mockGetOverviewBootstrap = vi.fn();
const mockGetAuthService = vi.fn();

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: () => getPlaywrightAuthStateMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetAuthService),
}));

describe('useOverviewBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_123',
      userId: 'user_123',
    });
    getPlaywrightAuthStateMock.mockReturnValue(null);
    mockGetOverviewBootstrap.mockResolvedValue({
      activeRuns: [],
      analytics: {},
      reviewInbox: {
        approvedCount: 0,
        changesRequestedCount: 0,
        pendingCount: 0,
        readyCount: 0,
        recentItems: [],
        rejectedCount: 0,
      },
      runs: [],
      stats: null,
      timeSeries: [],
    });
    mockGetAuthService.mockResolvedValue({
      getOverviewBootstrap: mockGetOverviewBootstrap,
    });
  });

  it('does not fetch when auth is not yet loaded', () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      orgId: null,
      userId: null,
    });

    const { result } = renderHook(() => useOverviewBootstrap(), {
      wrapper: createQueryWrapper(),
    });

    // Query is disabled — service must not be called
    expect(mockGetAuthService).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns initial data immediately without fetching when revalidateOnMount is false', () => {
    const initialReviewInbox = {
      approvedCount: 1,
      changesRequestedCount: 2,
      pendingCount: 3,
      readyCount: 4,
      recentItems: [],
      rejectedCount: 5,
    };

    const { result } = renderHook(
      () =>
        useOverviewBootstrap({
          initialActiveRuns: [],
          initialAnalytics: { totalCredentialsConnected: 7 },
          initialReviewInbox,
          initialRuns: [],
          initialStats: null,
          initialTimeSeriesData: [],
          revalidateOnMount: false,
        }),
      { wrapper: createQueryWrapper() },
    );

    // Initial data should surface synchronously (staleTime: Infinity path)
    expect(result.current.analytics).toEqual({ totalCredentialsConnected: 7 });
    expect(result.current.reviewInbox).toEqual(initialReviewInbox);
    expect(result.current.isLoading).toBe(false);

    // Service should not be called because revalidateOnMount is false
    expect(mockGetAuthService).not.toHaveBeenCalled();
  });

  it('fetches fresh data when revalidateOnMount is true and auth is ready', async () => {
    const serverData = {
      activeRuns: [],
      analytics: { totalCredentialsConnected: 99 },
      reviewInbox: {
        approvedCount: 10,
        changesRequestedCount: 0,
        pendingCount: 2,
        readyCount: 1,
        recentItems: [],
        rejectedCount: 0,
      },
      runs: [],
      stats: null,
      timeSeries: [],
    };
    mockGetOverviewBootstrap.mockResolvedValue(serverData);

    const { result } = renderHook(
      () =>
        useOverviewBootstrap({
          initialAnalytics: { totalCredentialsConnected: 7 },
          revalidateOnMount: true,
        }),
      { wrapper: createQueryWrapper() },
    );

    // Wait for the background refetch to complete and serve server data
    await waitFor(() => {
      expect(result.current.analytics).toEqual({
        totalCredentialsConnected: 99,
      });
    });

    expect(mockGetOverviewBootstrap).toHaveBeenCalledTimes(1);
  });

  it('returns empty defaults when no initial data and no fetch completes', () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      orgId: null,
      userId: null,
    });

    const { result } = renderHook(() => useOverviewBootstrap(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.activeRuns).toEqual([]);
    expect(result.current.runs).toEqual([]);
    expect(result.current.analytics).toEqual({});
    expect(result.current.stats).toBeNull();
    expect(result.current.timeSeriesData).toEqual([]);
    expect(typeof result.current.refresh).toBe('function');
  });
});
