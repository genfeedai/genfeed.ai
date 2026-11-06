import { beforeEach, describe, expect, it, vi } from 'vitest';

const EMPTY_OVERVIEW = {
  analytics: {},
  reviewInbox: {
    approvedCount: 0,
    changesRequestedCount: 0,
    pendingCount: 0,
    readyCount: 0,
    recentItems: [],
    rejectedCount: 0,
  },
  timeSeriesData: [],
};

const OVERVIEW_BOOTSTRAP = {
  analytics: { totalPosts: 12 },
  reviewInbox: {
    approvedCount: 1,
    changesRequestedCount: 0,
    pendingCount: 2,
    readyCount: 3,
    recentItems: [{ id: 'item-1' }],
    rejectedCount: 0,
  },
  timeSeries: [{ date: '2026-03-17', instagram: 10 }],
};

// Fake overview API: records every bootstrap request by the token it was
// authorized with, and only answers for the signed-in user's token.
const api = vi.hoisted(() => ({
  isDown: false,
  requests: [] as string[],
  token: 'token_123',
}));

vi.mock('@/server/protected-bootstrap.server', () => ({
  getServerAuthToken: async () => api.token,
  hasUsableServerAuthToken: async (token: string) => token.length > 0,
  isDesktopServerRequest: async () => false,
  shouldSkipCloudBootstrap: (token: string) => token.length === 0,
}));

vi.mock('@services/auth/auth.service', () => ({
  AuthService: {
    getInstance: (token: string) => ({
      getOverviewBootstrap: async () => {
        api.requests.push(token);
        if (api.isDown) {
          throw new Error('overview unavailable');
        }
        if (token !== 'token_123') {
          throw new Error('Unauthorized');
        }
        return OVERVIEW_BOOTSTRAP;
      },
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: () => undefined },
}));

describe('loadOverviewPageData', () => {
  beforeEach(() => {
    vi.resetModules();
    api.isDown = false;
    api.requests = [];
    api.token = 'token_123';
  });

  it('returns empty overview data in desktop shell mode without a cloud token', async () => {
    api.token = '';

    const { loadOverviewPageData } = await import(
      '@/server/overview-page-data.server'
    );

    await expect(loadOverviewPageData()).resolves.toEqual(EMPTY_OVERVIEW);
    expect(api.requests).toEqual([]);
  });

  it('loads overview with a single overview bootstrap request', async () => {
    const { loadOverviewPageData } = await import(
      '@/server/overview-page-data.server'
    );

    await expect(loadOverviewPageData()).resolves.toEqual({
      analytics: { totalPosts: 12 },
      reviewInbox: OVERVIEW_BOOTSTRAP.reviewInbox,
      timeSeriesData: [{ date: '2026-03-17', instagram: 10 }],
    });
    expect(api.requests).toEqual(['token_123']);
  });

  it('falls back to empty overview data when the bootstrap request fails', async () => {
    api.isDown = true;

    const { loadOverviewPageData } = await import(
      '@/server/overview-page-data.server'
    );

    await expect(loadOverviewPageData()).resolves.toEqual(EMPTY_OVERVIEW);
  });
});
