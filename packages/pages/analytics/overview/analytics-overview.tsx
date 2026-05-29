'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { useOptionalUser } from '@contexts/user/user-context/user-context';
import { useAgentDashboardStore } from '@genfeedai/agent/stores/agent-dashboard.store';
import {
  AnalyticsMetric,
  ButtonVariant,
  CardVariant,
  PageScope,
} from '@genfeedai/enums';
import type {
  DashboardScopePreferences,
  IAnalytics,
} from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAnalytics } from '@hooks/data/analytics/use-analytics/use-analytics';
import { useHealthChecks } from '@hooks/data/analytics/use-health-checks/use-health-checks';
import { useLeaderboards } from '@hooks/data/analytics/use-leaderboards/use-leaderboards';
import { useTimeseries } from '@hooks/data/analytics/use-timeseries/use-timeseries';
import {
  type TopPostData,
  useTopPosts,
} from '@hooks/data/analytics/use-top-posts/use-top-posts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { User } from '@models/auth/user.model';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import type {
  IBrandWithStats,
  IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import { UsersService } from '@services/organization/users.service';
import Card from '@ui/card/Card';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Loading from '@ui/loading/default/Loading';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import {
  HiOutlineChartBar,
  HiOutlineCreditCard,
  HiOutlineEye,
  HiOutlineFilm,
  HiOutlineGlobeAlt,
  HiOutlineNewspaper,
  HiOutlinePhoto,
  HiOutlineSparkles,
  HiOutlineUsers,
} from 'react-icons/hi2';
import AnalyticsOverviewAlerts from './analytics-overview-alerts';
import AnalyticsOverviewHero from './analytics-overview-hero';
import AnalyticsOverviewLeaderboards from './analytics-overview-leaderboards';
import OverviewPlaceholderCard from './analytics-overview-placeholder-card';

export interface AnalyticsOverviewProps {
  scope?: PageScope;
  basePath?: string;
  analytics?: Partial<IAnalytics>;
  brandsLeaderboard?: IBrandWithStats[];
  cachedAt?: string;
  orgsLeaderboard?: IOrgLeaderboardItem[];
  timeseriesData?: PlatformTimeSeriesDataPoint[];
  topPosts?: TopPostData[];
}

type DashboardState = 'empty' | 'warming_up' | 'active';

interface HeroAction {
  href: string;
  label: string;
  variant: ButtonVariant;
}

interface ProgressMetric {
  label: string;
  value: string;
}

interface DashboardHeroContent {
  badge: string;
  description: string;
  primaryAction: HeroAction;
  progressItems: ProgressMetric[];
  title: string;
}

const DB_DASHBOARD_SCOPE_KEY = 'organization';

const PlatformTimeSeriesChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/platform-time-series/platform-time-series-chart'
    ).then((mod) => mod.PlatformTimeSeriesChart),
  {
    loading: () => <div className="h-chart w-full animate-pulse bg-muted/60" />,
    ssr: false,
  },
);

const AnalyticsAgentDashboard = dynamic(
  () => import('./analytics-agent-dashboard'),
  {
    loading: () => null,
    ssr: false,
  },
);

export default function AnalyticsOverview({
  scope = PageScope.ORGANIZATION,
  basePath = '/analytics',
  analytics: initialAnalytics,
  brandsLeaderboard: initialBrandsLeaderboard = [],
  cachedAt: initialCachedAt = '',
  orgsLeaderboard: initialOrgsLeaderboard = [],
  timeseriesData: initialTimeseriesData = [],
  topPosts: initialTopPosts = [],
}: AnalyticsOverviewProps) {
  const agentBlocks = useAgentDashboardStore((s) => s.blocks);
  const isAgentModified = useAgentDashboardStore((s) => s.isAgentModified);
  const resetToDefaults = useAgentDashboardStore((s) => s.resetToDefaults);
  const hydrateState = useAgentDashboardStore((s) => s.hydrateState);
  const getLocalSnapshot = useAgentDashboardStore((s) => s.getLocalSnapshot);
  const userContext = useOptionalUser();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const { orgHref } = useOrgUrl();
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange.startDate ?? undefined,
    dateRange.endDate ?? undefined,
  );

  const {
    analytics,
    cachedAt: analyticsCachedAt,
    error: analyticsError,
    isLoading,
    isRefreshing,
    isUsingCache: isAnalyticsUsingCache,
    refresh: refreshAnalytics,
  } = useAnalytics({
    autoLoad: true,
    endDate,
    initialCachedAt: initialCachedAt || null,
    initialData: initialAnalytics,
    revalidateOnMount: false,
    scope,
    startDate,
  });

  const { healthAlertMessage, healthCheckedAt, runHealthChecks } =
    useHealthChecks();

  const {
    brandsLeaderboard,
    fetchLeaderboards,
    isLeaderboardLoading,
    isLeaderboardUsingCache,
    leaderboardCachedAt,
    orgsLeaderboard,
  } = useLeaderboards({
    dateRange,
    initialBrandsLeaderboard,
    initialCachedAt: initialCachedAt || null,
    initialOrgsLeaderboard,
    refreshTrigger,
    revalidateOnMount: false,
    scope,
  });

  const {
    fetchTimeseries,
    isTimeseriesLoading,
    isTimeseriesUsingCache,
    timeseriesCachedAt,
    timeseriesData,
  } = useTimeseries({
    dateRange,
    initialCachedAt: initialCachedAt || null,
    initialData: initialTimeseriesData,
    refreshTrigger,
    revalidateOnMount: false,
    scope,
  });

  const {
    cachedAt: topPostsCachedAt,
    isLoading: isTopPostsLoading,
    isUsingCache: isTopPostsUsingCache,
    topPosts,
  } = useTopPosts({
    initialCachedAt: initialCachedAt || null,
    initialData: initialTopPosts,
    limit: 10,
    metric: AnalyticsMetric.VIEWS,
    revalidateOnMount: false,
  });

  const retryAllData = useMemo(
    () => () => {
      refreshAnalytics().catch(() => undefined);
      fetchLeaderboards();
      fetchTimeseries();
    },
    [fetchLeaderboards, fetchTimeseries, refreshAnalytics],
  );

  useEffect(() => {
    if (refreshTrigger > 0) {
      retryAllData();
    }
  }, [refreshTrigger, retryAllData]);

  const isUsingAnyCache =
    isAnalyticsUsingCache ||
    isLeaderboardUsingCache ||
    isTimeseriesUsingCache ||
    isTopPostsUsingCache;

  const hasAnalyticsError = Boolean(analyticsError);

  const cachedTimestamp = useMemo(() => {
    const timestamps = [
      analyticsCachedAt,
      leaderboardCachedAt,
      timeseriesCachedAt,
      topPostsCachedAt,
    ]
      .filter((value) => value)
      .map((value) => new Date(value as string).getTime())
      .filter((value) => !Number.isNaN(value));

    if (timestamps.length === 0) {
      return null;
    }

    return new Date(Math.max(...timestamps)).toISOString();
  }, [
    analyticsCachedAt,
    leaderboardCachedAt,
    timeseriesCachedAt,
    topPostsCachedAt,
  ]);

  const cachedLabel = useMemo(() => {
    if (!cachedTimestamp) {
      return '';
    }
    return format(new Date(cachedTimestamp), 'PPpp');
  }, [cachedTimestamp]);

  const kpiItems = useMemo(() => {
    if (scope === PageScope.SUPERADMIN) {
      return [
        {
          description: 'Active platform subscriptions',
          icon: HiOutlineCreditCard,
          label: 'Total Subscriptions',
          value: analytics?.totalSubscriptions || 0,
        },
        {
          description: 'Registered users',
          icon: HiOutlineUsers,
          label: 'Total Users',
          value: analytics?.totalUsers || 0,
        },
        {
          description: 'Video ingredients created',
          icon: HiOutlineFilm,
          label: 'Total Videos',
          value: analytics?.totalVideos || 0,
        },
        {
          description: 'Image ingredients created',
          icon: HiOutlinePhoto,
          label: 'Total Images',
          value: analytics?.totalImages || 0,
        },
        {
          description: 'Published posts',
          icon: HiOutlineNewspaper,
          label: 'Total Posts',
          value: analytics?.totalPosts || 0,
        },
        {
          description: 'Social brands',
          icon: HiOutlineSparkles,
          label: 'Total Brands',
          value: analytics?.totalBrands || 0,
        },
      ];
    }

    return [
      {
        description: 'Connected social accounts with analytics',
        icon: HiOutlineCreditCard,
        label: 'Connected Accounts',
        value: analytics?.totalCredentialsConnected || 0,
      },
      {
        description: 'Published posts in the selected range',
        icon: HiOutlineNewspaper,
        label: 'Total Posts',
        value: analytics?.totalPosts || 0,
      },
      {
        description: 'Tracked views in the selected range',
        icon: HiOutlineEye,
        label: 'Total Views',
        trend:
          analytics?.totalViews && analytics?.viewsGrowth
            ? analytics.viewsGrowth
            : undefined,
        trendLabel: 'vs prev',
        value: analytics?.totalViews || 0,
      },
      {
        description: 'Likes, comments, shares, and saves combined',
        icon: HiOutlineSparkles,
        label: 'Total Engagement',
        trend:
          analytics?.totalEngagement && analytics?.engagementGrowth
            ? analytics.engagementGrowth
            : undefined,
        trendLabel: 'vs prev',
        value: analytics?.totalEngagement || 0,
      },
      {
        description: 'Average engagement rate across tracked posts',
        icon: HiOutlineChartBar,
        label: 'Avg Engagement Rate',
        value: `${(analytics?.avgEngagementRate || 0).toFixed(2)}%`,
        valueClassName: 'text-4xl',
      },
      {
        description: 'Platforms with tracked analytics in range',
        icon: HiOutlineGlobeAlt,
        label: 'Active Platforms',
        value: analytics?.activePlatforms?.length || 0,
      },
    ];
  }, [analytics, scope]);

  const hasConnectedAccounts = (analytics?.totalCredentialsConnected || 0) > 0;
  const hasPosts = (analytics?.totalPosts || 0) > 0;
  const hasViews = (analytics?.totalViews || 0) > 0;
  const hasEngagement = (analytics?.totalEngagement || 0) > 0;
  const hasTopPosts = topPosts.length > 0;
  const hasBrandLeaderboard = brandsLeaderboard.length > 0;
  const hasOrgLeaderboard = orgsLeaderboard.length > 0;
  const hasTimeseriesData = timeseriesData.some((point) =>
    Object.entries(point).some(
      ([key, value]) =>
        key !== 'date' && typeof value === 'number' && value > 0,
    ),
  );

  const dashboardState: DashboardState = useMemo(() => {
    if (
      !hasConnectedAccounts &&
      !hasPosts &&
      !hasViews &&
      !hasEngagement &&
      !hasTimeseriesData
    ) {
      return 'empty';
    }

    if (
      (hasConnectedAccounts ||
        hasPosts ||
        hasTopPosts ||
        hasBrandLeaderboard) &&
      !hasViews &&
      !hasEngagement &&
      !hasTimeseriesData
    ) {
      return 'warming_up';
    }

    return 'active';
  }, [
    hasBrandLeaderboard,
    hasConnectedAccounts,
    hasEngagement,
    hasPosts,
    hasTimeseriesData,
    hasTopPosts,
    hasViews,
  ]);

  const heroContent = useMemo<DashboardHeroContent>(() => {
    if (scope === PageScope.SUPERADMIN) {
      return {
        badge: 'Network view',
        description:
          'Track platform health, network activity, and where momentum is building across organizations.',
        primaryAction: {
          href: `${basePath}/organizations`,
          label: 'Review organizations',
          variant: ButtonVariant.DEFAULT,
        },
        progressItems: [
          {
            label: 'Subscriptions',
            value: formatCompactNumberIntl(analytics?.totalSubscriptions || 0),
          },
          {
            label: 'Users',
            value: formatCompactNumberIntl(analytics?.totalUsers || 0),
          },
          {
            label: 'Brands',
            value: formatCompactNumberIntl(analytics?.totalBrands || 0),
          },
        ],
        title: 'Analytics overview',
      };
    }

    if (dashboardState === 'empty') {
      return {
        badge: 'First run',
        description:
          'This view will start surfacing winners, trends, and rankings once at least one social account is connected and content is published into the selected date range.',
        primaryAction: {
          href: orgHref('/settings/api-keys'),
          label: 'Connect accounts',
          variant: ButtonVariant.DEFAULT,
        },
        progressItems: [
          {
            label: 'Connected accounts',
            value: formatCompactNumberIntl(
              analytics?.totalCredentialsConnected || 0,
            ),
          },
          {
            label: 'Published posts',
            value: formatCompactNumberIntl(analytics?.totalPosts || 0),
          },
          {
            label: 'Tracked platforms',
            value: formatCompactNumberIntl(
              analytics?.activePlatforms?.length || 0,
            ),
          },
        ],
        title: 'Your analytics home is ready',
      };
    }

    if (dashboardState === 'warming_up') {
      return {
        badge: 'Warming up',
        description:
          'Setup is in place, but there is not enough tracked performance data yet to tell a useful story. Keep publishing and check back after the next sync window.',
        primaryAction: {
          href: '/posts',
          label: 'Create content',
          variant: ButtonVariant.DEFAULT,
        },
        progressItems: [
          {
            label: 'Connected accounts',
            value: formatCompactNumberIntl(
              analytics?.totalCredentialsConnected || 0,
            ),
          },
          {
            label: 'Posts in range',
            value: formatCompactNumberIntl(analytics?.totalPosts || 0),
          },
          {
            label: 'Active platforms',
            value: formatCompactNumberIntl(
              analytics?.activePlatforms?.length || 0,
            ),
          },
        ],
        title: 'Data is starting to come through',
      };
    }

    return {
      badge: 'Active',
      description:
        'Use this snapshot to see what moved in the selected range, which platforms are active, and which posts or brands are pulling ahead.',
      primaryAction: {
        href: '/posts?status=public',
        label: 'View published posts',
        variant: ButtonVariant.DEFAULT,
      },
      progressItems: [
        {
          label: 'Views',
          value: formatCompactNumberIntl(analytics?.totalViews || 0),
        },
        {
          label: 'Engagement',
          value: formatCompactNumberIntl(analytics?.totalEngagement || 0),
        },
        {
          label: 'Platforms',
          value: formatCompactNumberIntl(
            analytics?.activePlatforms?.length || 0,
          ),
        },
      ],
      title: 'Performance snapshot',
    };
  }, [analytics, basePath, dashboardState, orgHref, scope]);

  const primaryKpiItems = useMemo(() => {
    if (scope === PageScope.SUPERADMIN) {
      return kpiItems.slice(0, 4);
    }

    return dashboardState === 'active'
      ? kpiItems.slice(1, 5)
      : kpiItems.slice(0, 3);
  }, [dashboardState, kpiItems, scope]);

  const secondaryKpiItems = useMemo(() => {
    if (scope === PageScope.SUPERADMIN) {
      return kpiItems.slice(4);
    }

    return dashboardState === 'active' ? [kpiItems[0], kpiItems[5]] : [];
  }, [dashboardState, kpiItems, scope]);

  const showAgentDashboard = isAgentModified && agentBlocks.length > 0;

  const persistAgentDashboardState = async (
    userId: string,
    settingsPatch: {
      dashboardPreferences: {
        scopes: Record<string, DashboardScopePreferences>;
      };
    },
  ) => {
    const service = await getUsersService();
    await service.patchSettings(userId, settingsPatch);
  };

  const updateLocalUser = (nextScopeState: DashboardScopePreferences) => {
    const currentUser = userContext?.currentUser;
    if (!currentUser || !userContext?.mutateUser) {
      return;
    }

    userContext.mutateUser(
      new User({
        ...currentUser,
        settings: {
          ...currentUser.settings,
          dashboardPreferences: {
            scopes: {
              ...currentUser.settings?.dashboardPreferences?.scopes,
              [DB_DASHBOARD_SCOPE_KEY]: nextScopeState,
            },
          },
        },
      }),
    );
  };

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <>
      <AnalyticsAgentDashboard
        agentBlocks={agentBlocks}
        currentUser={userContext?.currentUser ?? null}
        disabled={scope === PageScope.SUPERADMIN}
        getLocalSnapshot={getLocalSnapshot}
        hydrateState={hydrateState}
        isAgentModified={isAgentModified}
        onResetToDefaults={resetToDefaults}
        persistState={persistAgentDashboardState}
        scope={DB_DASHBOARD_SCOPE_KEY}
        updateLocalUser={updateLocalUser}
      />

      <div
        className={cn('flex flex-col gap-6', showAgentDashboard && 'hidden')}
      >
        <Card
          variant={CardVariant.DEFAULT}
          bodyClassName="overflow-hidden p-6 lg:p-8"
        >
          <AnalyticsOverviewHero
            dashboardState={dashboardState}
            heroContent={heroContent}
            orgHref={orgHref}
          />
        </Card>

        <AnalyticsOverviewAlerts
          cachedLabel={cachedLabel}
          hasAnalyticsError={hasAnalyticsError}
          healthAlertMessage={healthAlertMessage}
          healthCheckedAt={healthCheckedAt}
          isUsingAnyCache={isUsingAnyCache}
          retryAllData={retryAllData}
          runHealthChecks={runHealthChecks}
        />

        {primaryKpiItems.length > 0 && (
          <KPISection
            title={
              dashboardState === 'active' || scope === PageScope.SUPERADMIN
                ? 'What moved in this range'
                : 'Coverage so far'
            }
            gridCols={{ desktop: 4, mobile: 1, tablet: 2 }}
            className="bg-background"
            isLoading={isRefreshing}
            items={primaryKpiItems}
          />
        )}

        {secondaryKpiItems.length > 0 && (
          <KPISection
            title="Coverage details"
            gridCols={{ desktop: 2, mobile: 1, tablet: 2 }}
            className="bg-background"
            isLoading={isRefreshing}
            items={secondaryKpiItems}
          />
        )}

        {hasTimeseriesData || isTimeseriesLoading ? (
          <Card
            variant={CardVariant.DEFAULT}
            label="Posts views by platform over time"
            description="Use this to see which channels are actually contributing movement in the selected range."
          >
            <PlatformTimeSeriesChart
              data={timeseriesData}
              platforms={[
                'instagram',
                'tiktok',
                'youtube',
                'twitter',
                'facebook',
              ]}
              isLoading={isTimeseriesLoading}
              height={400}
            />
          </Card>
        ) : (
          <OverviewPlaceholderCard
            title="Trend lines will appear here once performance data lands"
            description="After connected accounts publish content and analytics sync back, this chart will show which platforms are growing, flat, or underperforming."
            icon={HiOutlineChartBar}
            primaryAction={{
              href: '/posts',
              label: 'Create a post',
              variant: ButtonVariant.DEFAULT,
            }}
            secondaryAction={{
              href: orgHref('/settings/api-keys'),
              label: 'Check connections',
              variant: ButtonVariant.SECONDARY,
            }}
          />
        )}

        <AnalyticsOverviewLeaderboards
          basePath={basePath}
          brandsLeaderboard={brandsLeaderboard}
          hasBrandLeaderboard={hasBrandLeaderboard}
          hasOrgLeaderboard={hasOrgLeaderboard}
          hasTopPosts={hasTopPosts}
          isLeaderboardLoading={isLeaderboardLoading}
          isTopPostsLoading={isTopPostsLoading}
          orgsLeaderboard={orgsLeaderboard}
          scope={scope}
          topPosts={topPosts}
        />
      </div>
    </>
  );
}
