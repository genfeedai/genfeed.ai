import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerAuthTokenMock = vi.fn();
const getOverviewBootstrapMock = vi.fn();
const shouldSkipCloudBootstrapMock = vi.fn();
const isDesktopServerRequestMock = vi.fn();
const getInstanceMock = vi.fn(() => ({
  getOverviewBootstrap: getOverviewBootstrapMock,
}));

vi.mock('@app-server/protected-bootstrap.server', () => ({
  getServerAuthToken: getServerAuthTokenMock,
  hasUsableServerAuthToken: vi.fn().mockReturnValue(true),
  shouldSkipCloudBootstrap: shouldSkipCloudBootstrapMock,
  isDesktopServerRequest: isDesktopServerRequestMock,
}));

vi.mock('@services/auth/auth.service', () => ({
  AuthService: {
    getInstance: getInstanceMock,
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('loadOverviewPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getServerAuthTokenMock.mockResolvedValue('token_123');
    shouldSkipCloudBootstrapMock.mockReturnValue(false);
    isDesktopServerRequestMock.mockResolvedValue(false);
    getOverviewBootstrapMock.mockResolvedValue({
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
    });
  });

  it('returns empty overview data in desktop shell mode without a cloud token', async () => {
    getServerAuthTokenMock.mockResolvedValue('');
    shouldSkipCloudBootstrapMock.mockReturnValue(true);

    const { loadOverviewPageData } = await import(
      '@app-server/overview-page-data.server'
    );

    await expect(loadOverviewPageData()).resolves.toEqual({
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
    });
    expect(getInstanceMock).not.toHaveBeenCalled();
  });

  it('loads overview with a single overview bootstrap request', async () => {
    const { loadOverviewPageData } = await import(
      '@app-server/overview-page-data.server'
    );

    const result = await loadOverviewPageData();

    expect(getInstanceMock).toHaveBeenCalledWith('token_123');
    expect(getOverviewBootstrapMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      analytics: { totalPosts: 12 },
      reviewInbox: {
        approvedCount: 1,
        changesRequestedCount: 0,
        pendingCount: 2,
        readyCount: 3,
        recentItems: [{ id: 'item-1' }],
        rejectedCount: 0,
      },
      timeSeriesData: [{ date: '2026-03-17', instagram: 10 }],
    });
  });
});
