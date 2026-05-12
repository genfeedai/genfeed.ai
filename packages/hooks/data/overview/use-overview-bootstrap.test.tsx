// @vitest-environment jsdom
'use client';

import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useAuthedServiceMock = vi.fn();
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

describe('useOverviewBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_123',
    });
    getPlaywrightAuthStateMock.mockReturnValue(null);
  });

  // TODO: update test to verify useQuery behavior
  it('waits for Clerk auth readiness before enabling the overview bootstrap fetch', () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      userId: null,
    });

    renderHook(() => useOverviewBootstrap(), { wrapper: createQueryWrapper() });

    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });

  // TODO: update test to verify useQuery behavior
  it('uses hydrated overview data without forcing a fetch on mount', () => {
    const initialReviewInbox = {
      approvedCount: 1,
      changesRequestedCount: 2,
      pendingCount: 3,
      readyCount: 4,
      recentItems: [],
      rejectedCount: 5,
    };

    renderHook(
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

    expect(useAuthedServiceMock).not.toHaveBeenCalled();
  });
});
