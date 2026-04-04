// @vitest-environment jsdom
'use client';

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useAuthedServiceMock = vi.fn();
const useResourceMock = vi.fn();
const getPlaywrightAuthStateMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  getPlaywrightAuthState: () => getPlaywrightAuthStateMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => useAuthedServiceMock,
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
}));

describe('useOverviewBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_123',
    });
    getPlaywrightAuthStateMock.mockReturnValue(null);
    useResourceMock.mockImplementation(
      (_fetcher: unknown, options?: Record<string, unknown>) => ({
        data: options?.initialData ?? null,
        isLoading: false,
        refresh: vi.fn().mockResolvedValue(undefined),
      }),
    );
  });

  it('waits for Clerk auth readiness before enabling the overview bootstrap fetch', async () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      userId: null,
    });

    const { useOverviewBootstrap } = await import(
      '@hooks/data/overview/use-overview-bootstrap'
    );

    renderHook(() => useOverviewBootstrap());

    expect(useResourceMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        enabled: false,
        initialData: undefined,
        revalidateOnMount: true,
      }),
    );
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  it('uses hydrated overview data without forcing a fetch on mount', async () => {
    const initialReviewInbox = {
      approvedCount: 1,
      changesRequestedCount: 2,
      pendingCount: 3,
      readyCount: 4,
      recentItems: [],
      rejectedCount: 5,
    };

    const { useOverviewBootstrap } = await import(
      '@hooks/data/overview/use-overview-bootstrap'
    );

    renderHook(() =>
      useOverviewBootstrap({
        initialActiveRuns: [],
        initialAnalytics: { totalCredentialsConnected: 7 },
        initialReviewInbox,
        initialRuns: [],
        initialStats: null,
        initialTimeSeriesData: [],
        revalidateOnMount: false,
      }),
    );

    expect(useResourceMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        enabled: true,
        initialData: expect.objectContaining({
          analytics: { totalCredentialsConnected: 7 },
          reviewInbox: initialReviewInbox,
        }),
        revalidateOnMount: false,
      }),
    );
    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });
});
