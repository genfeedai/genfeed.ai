import AnalyticsOverview from '@pages/analytics/overview/analytics-overview';
import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({
  default: () =>
    function MockDynamicComponent() {
      return <div data-testid="platform-time-series-chart" />;
    },
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('@genfeedai/enums', () => ({
  AlertCategory: {
    ERROR: 'error',
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
  },
  AnalyticsMetric: {
    COMMENTS: 'comments',
    ENGAGEMENT: 'engagement',
    ENGAGEMENT_RATE: 'engagement_rate',
    LIKES: 'likes',
    POSTS: 'posts',
    SAVES: 'saves',
    SHARES: 'shares',
    VIEWS: 'views',
  },
  ButtonSize: {
    LG: 'lg',
    MD: 'md',
    SM: 'sm',
    XS: 'xs',
  },
  ButtonVariant: {
    DEFAULT: 'default',
    DESTRUCTIVE: 'destructive',
    GHOST: 'ghost',
    LINK: 'link',
    OUTLINE: 'outline',
    SECONDARY: 'secondary',
    UNSTYLED: 'unstyled',
  },
  CardVariant: {
    DEFAULT: 'default',
    GHOST: 'ghost',
    OUTLINE: 'outline',
  },
  PageScope: {
    BRAND: 'brand',
    ORGANIZATION: 'organization',
    PERSONAL: 'personal',
  },
}));

const mockAnalyticsContext = {
  dateRange: {
    endDate: new Date('2026-03-09'),
    startDate: new Date('2026-03-03'),
  },
  refreshTrigger: 0,
};

const mockAnalyticsStore = {
  blocks: [],
  hydrateState: vi.fn(),
  isAgentModified: false,
  resetToDefaults: vi.fn(),
};

const mockUserContext = {
  currentUser: null,
  mutateUser: vi.fn(),
};

const mockAnalyticsReturn = {
  analytics: {
    activePlatforms: [],
    avgEngagementRate: 0,
    engagementGrowth: 0,
    totalBrands: 0,
    totalCredentialsConnected: 0,
    totalEngagement: 0,
    totalImages: 0,
    totalPosts: 0,
    totalSubscriptions: 0,
    totalUsers: 0,
    totalVideos: 0,
    totalViews: 0,
    viewsGrowth: 0,
  },
  cachedAt: null,
  error: null,
  isLoading: false,
  isRefreshing: false,
  isUsingCache: false,
  refresh: vi.fn().mockResolvedValue(undefined),
};

const mockHealthChecksReturn = {
  healthAlertMessage: null,
  healthCheckedAt: null,
  runHealthChecks: vi.fn(),
};

const mockLeaderboardsReturn = {
  brandsLeaderboard: [],
  fetchLeaderboards: vi.fn(),
  isLeaderboardLoading: false,
  isLeaderboardUsingCache: false,
  leaderboardCachedAt: null,
  orgsLeaderboard: [],
};

const mockTimeseriesReturn = {
  fetchTimeseries: vi.fn(),
  isTimeseriesLoading: false,
  isTimeseriesUsingCache: false,
  timeseriesCachedAt: null,
  timeseriesData: [],
};

const mockTopPostsReturn = {
  cachedAt: null,
  isLoading: false,
  isUsingCache: false,
  topPosts: [],
};
const mockUseAgentDashboardPersistence = vi.hoisted(() => vi.fn());

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => mockAnalyticsContext,
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useOptionalUser: () => mockUserContext,
}));

vi.mock('@genfeedai/agent/hooks/use-agent-dashboard-persistence', () => ({
  useAgentDashboardPersistence: mockUseAgentDashboardPersistence,
}));

vi.mock('@genfeedai/agent/components/blocks', () => ({
  DynamicBlockGrid: () => <div data-testid="dynamic-block-grid" />,
}));

vi.mock('@genfeedai/agent', () => ({
  DynamicBlockGrid: () => <div data-testid="dynamic-block-grid" />,
  useAgentDashboardStore: (
    selector: (state: typeof mockAnalyticsStore) => unknown,
  ) => selector(mockAnalyticsStore),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@hooks/data/analytics/use-analytics/use-analytics', () => ({
  useAnalytics: () => mockAnalyticsReturn,
}));

vi.mock('@hooks/data/analytics/use-health-checks/use-health-checks', () => ({
  useHealthChecks: () => mockHealthChecksReturn,
}));

vi.mock('@hooks/data/analytics/use-leaderboards/use-leaderboards', () => ({
  useLeaderboards: () => mockLeaderboardsReturn,
}));

vi.mock('@hooks/data/analytics/use-timeseries/use-timeseries', () => ({
  useTimeseries: () => mockTimeseriesReturn,
}));

vi.mock('@hooks/data/analytics/use-top-posts/use-top-posts', () => ({
  useTopPosts: () => mockTopPostsReturn,
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {},
}));

vi.mock('@services/analytics/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));

vi.mock('@services/organization/users.service', () => ({
  UsersService: class UsersService {},
}));

vi.mock('@ui/analytics/top-posts/TopPostsSection', () => ({
  default: () => <div data-testid="top-posts-section" />,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: () => <button type="button" />,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: () => <div data-testid="table" />,
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: () => <div data-testid="alert" />,
}));

vi.mock('@ui/kpi/kpi-section/KPISection', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div data-testid="loading" />,
}));

vi.mock('@ui/primitives/button', () => ({
  buttonVariants: () => '',
}));

describe('AnalyticsOverview', () => {
  function renderOverview() {
    return renderToStaticMarkup(<AnalyticsOverview />);
  }

  beforeEach(() => {
    globalThis.IntersectionObserver = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    } as typeof IntersectionObserver;

    mockAnalyticsStore.blocks = [];
    mockAnalyticsStore.isAgentModified = false;
    mockAnalyticsReturn.analytics = {
      activePlatforms: [],
      avgEngagementRate: 0,
      engagementGrowth: 0,
      totalBrands: 0,
      totalCredentialsConnected: 0,
      totalEngagement: 0,
      totalImages: 0,
      totalPosts: 0,
      totalSubscriptions: 0,
      totalUsers: 0,
      totalVideos: 0,
      totalViews: 0,
      viewsGrowth: 0,
    };
    mockLeaderboardsReturn.brandsLeaderboard = [];
    mockLeaderboardsReturn.orgsLeaderboard = [];
    mockTimeseriesReturn.timeseriesData = [];
    mockTopPostsReturn.topPosts = [];
    mockUseAgentDashboardPersistence.mockClear();
  });

  it('renders first-run guidance when no analytics data exists', () => {
    const markup = renderOverview();

    expect(markup).toContain('Coverage so far');
    expect(markup).toContain('Your analytics home is ready');
    expect(markup).toContain('First run');
    expect(markup).toContain('/acme/~/settings/api-keys');
    expect(markup).toContain(
      'Trend lines will appear here once performance data lands',
    );
  });

  it('mounts agent dashboard persistence before the customized dashboard is visible', async () => {
    const { default: AnalyticsAgentDashboard } = await import(
      './analytics-agent-dashboard'
    );

    renderToStaticMarkup(
      <AnalyticsAgentDashboard
        agentBlocks={[]}
        currentUser={null}
        getLocalSnapshot={() => ({
          blocks: [],
          isAgentModified: false,
        })}
        hydrateState={() => {}}
        isAgentModified={false}
        onResetToDefaults={() => {}}
        persistState={async () => {}}
      />,
    );

    expect(mockUseAgentDashboardPersistence).toHaveBeenCalledTimes(1);
  });

  it('renders warming-up messaging when setup exists but performance is still sparse', () => {
    mockAnalyticsReturn.analytics = {
      ...mockAnalyticsReturn.analytics,
      activePlatforms: ['instagram'],
      totalCredentialsConnected: 2,
      totalPosts: 6,
    };

    const markup = renderOverview();

    expect(markup).toContain('Data is starting to come through');
    expect(markup).toContain('Warming up');
    expect(markup).toContain('Coverage so far');
    expect(markup).toContain('/posts');
  });

  it('renders the active dashboard when metrics and time series data are available', () => {
    mockAnalyticsReturn.analytics = {
      ...mockAnalyticsReturn.analytics,
      activePlatforms: ['instagram', 'youtube'],
      avgEngagementRate: 4.75,
      engagementGrowth: 16,
      totalCredentialsConnected: 3,
      totalEngagement: 824,
      totalPosts: 18,
      totalViews: 12450,
      viewsGrowth: 21,
    };
    mockTimeseriesReturn.timeseriesData = [
      { date: '2026-03-03', instagram: 10 },
      { date: '2026-03-04', instagram: 25, youtube: 5 },
    ];
    mockTopPostsReturn.topPosts = [
      {
        description: 'Top performer',
        platform: 'instagram',
        postId: 'post-1',
        totalComments: 4,
        totalLikes: 30,
        totalViews: 240,
      },
    ];
    mockLeaderboardsReturn.brandsLeaderboard = [
      {
        activePlatforms: ['instagram'],
        avgEngagementRate: 5.2,
        createdAt: '2026-03-01',
        growth: 10,
        id: 'brand-1',
        logo: '',
        name: 'Acme',
        organizationId: 'org-1',
        organizationName: 'Org',
        totalEngagement: 120,
        totalPosts: 8,
        totalViews: 2400,
      },
    ];

    const markup = renderOverview();

    expect(markup).toContain('Top brands');
    expect(markup).toContain('Performance snapshot');
    expect(markup).toContain('What moved in this range');
    expect(markup).toContain('platform-time-series-chart');
    expect(markup).toContain('top-posts-section');
  });
});
