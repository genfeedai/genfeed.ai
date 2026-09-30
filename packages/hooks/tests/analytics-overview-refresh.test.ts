import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { useAnalyticsOverview } from '@pages/analytics/overview/use-analytics-overview';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  context: {
    dateRange: {
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
    },
    refreshTrigger: 0,
  },
  leaderboards: vi.fn(),
  timeseries: vi.fn(),
  service: { findOrganizationAnalytics: vi.fn(() => new Promise(() => {})) },
  store: {
    blocks: [],
    isAgentModified: false,
    resetToDefaults: () => {},
    hydrateState: () => {},
    getLocalSnapshot: () => null,
  },
}));
vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => state.context,
}));
vi.mock('@contexts/user/user-context/user-context', () => ({
  useOptionalUser: () => null,
}));
vi.mock('@genfeedai/agent/stores/agent-dashboard.store', () => ({
  useAgentDashboardStore: (selector: (s: typeof state.store) => unknown) =>
    selector(state.store),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1', organizationId: 'org-1' }),
}));
const serviceFactory = async () => state.service;
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => serviceFactory,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (p: string) => p }),
}));
vi.mock('@hooks/data/analytics/use-health-checks/use-health-checks', () => ({
  useHealthChecks: () => ({
    healthAlertMessage: null,
    healthCheckedAt: null,
    runHealthChecks: () => {},
  }),
}));
vi.mock('@hooks/data/analytics/use-leaderboards/use-leaderboards', () => ({
  useLeaderboards: () => ({
    brandsLeaderboard: [],
    orgsLeaderboard: [],
    fetchLeaderboards: state.leaderboards,
  }),
}));
vi.mock('@hooks/data/analytics/use-timeseries/use-timeseries', () => ({
  useTimeseries: () => ({
    timeseriesData: [],
    fetchTimeseries: state.timeseries,
  }),
}));
vi.mock('@hooks/data/analytics/use-top-posts/use-top-posts', () => ({
  useTopPosts: () => ({ topPosts: [] }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.context.refreshTrigger = 0;
});

it('does not refresh again on an unrelated render after one refresh event', async () => {
  const { rerender, unmount } = renderHook(
    () =>
      useAnalyticsOverview({
        analytics: { totalPosts: 1 },
        cachedAt: '',
        scope: 'organization',
      }),
    { wrapper: createQueryWrapper() },
  );
  state.context.refreshTrigger = 1;
  rerender();
  await act(async () => {
    await Promise.resolve();
  });
  state.leaderboards.mockClear();
  rerender();
  try {
    expect(state.leaderboards).not.toHaveBeenCalled();
    state.context.refreshTrigger = 2;
    rerender();
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.leaderboards).toHaveBeenCalledTimes(1);
    expect(state.timeseries).toHaveBeenCalledTimes(2);
  } finally {
    unmount();
  }
});
