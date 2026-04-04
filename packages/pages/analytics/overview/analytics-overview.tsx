'use client';

import { useAgentDashboardStore } from '@cloud/agent/stores/agent-dashboard.store';
import type { DashboardScopePreferences, IAnalytics } from '@cloud/interfaces';
import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { useOptionalUser } from '@contexts/user/user-context/user-context';
import {
  AlertCategory,
  AnalyticsMetric,
  ButtonSize,
  ButtonVariant,
  CardVariant,
} from '@genfeedai/enums';
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
import { User } from '@models/auth/user.model';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import type { TableColumn } from '@props/ui/display/table.props';
import type {
  IBrandWithStats,
  IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import { UsersService } from '@services/organization/users.service';
import TopPostsSection from '@ui/analytics/top-posts/TopPostsSection';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Loading from '@ui/loading/default/Loading';
import { buttonVariants } from '@ui/primitives/button';
import { PageScope } from '@ui-constants/misc.constant';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import type { IconType } from 'react-icons';
import {
  HiMiniArrowTrendingUp,
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineCreditCard,
  HiOutlineEye,
  HiOutlineFilm,
  HiOutlineGlobeAlt,
  HiOutlineInformationCircle,
  HiOutlineNewspaper,
  HiOutlinePhoto,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
  HiOutlineUsers,
} from 'react-icons/hi2';

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

interface PlaceholderCardProps {
  title: string;
  description: string;
  icon: IconType;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
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

function OverviewPlaceholderCard({
  title,
  description,
  icon: Icon,
  primaryAction,
  secondaryAction,
}: PlaceholderCardProps) {
  return (
    <Card variant={CardVariant.DEFAULT} bodyClassName="p-6">
      <div className="flex h-full flex-col gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-foreground/70">
          <Icon className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h3>
          <p className="max-w-2xl text-sm leading-6 text-foreground/70">
            {description}
          </p>
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {primaryAction ? (
              <Link
                href={primaryAction.href}
                className={buttonVariants({
                  size: ButtonSize.SM,
                  variant: primaryAction.variant,
                })}
              >
                {primaryAction.label}
              </Link>
            ) : null}
            {secondaryAction ? (
              <Link
                href={secondaryAction.href}
                className={buttonVariants({
                  size: ButtonSize.SM,
                  variant: secondaryAction.variant,
                })}
              >
                {secondaryAction.label}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

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
          href: '/settings/organization/credentials',
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
  }, [analytics, basePath, dashboardState, scope]);

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

  const orgsColumns: TableColumn<IOrgLeaderboardItem>[] = useMemo(
    () => [
      {
        className: 'w-10',
        header: '#',
        key: 'rank',
        render: (item) => (
          <span className="font-mono font-bold">{item.rank}</span>
        ),
      },
      {
        header: 'Organization',
        key: 'organization',
        render: (item) => (
          <Link
            href={`${basePath}/organizations/${item.organization.id}`}
            className="flex items-center gap-2 hover:text-primary"
          >
            {item.organization.logo ? (
              <Image
                src={item.organization.logo}
                alt={item.organization.name || 'Org'}
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                {(item.organization.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="max-w-32 truncate font-medium">
              {item.organization.name || 'Unknown'}
            </span>
          </Link>
        ),
      },
      {
        className: 'text-right',
        header: 'Posts',
        key: 'totalPosts',
        render: (item) => (
          <span className="font-mono">{item.totalPosts.toLocaleString()}</span>
        ),
      },
      {
        className: 'text-right',
        header: 'Engagement',
        key: 'totalEngagement',
        render: (item) => (
          <span className="font-mono">
            {item.totalEngagement.toLocaleString()}
          </span>
        ),
      },
    ],
    [basePath],
  );

  const brandsColumns: TableColumn<IBrandWithStats>[] = useMemo(
    () => [
      {
        className: 'w-10',
        header: '#',
        key: 'rank',
        render: (item) => (
          <span className="font-mono font-bold">
            {brandsLeaderboard.findIndex((brand) => brand.id === item.id) + 1}
          </span>
        ),
      },
      {
        header: 'Brand',
        key: 'name',
        render: (item) => (
          <Link
            href={`${basePath}/brands/${item.id}`}
            className="flex items-center gap-2 hover:text-primary"
          >
            {item.logo ? (
              <Image
                src={item.logo}
                alt={item.name || 'Brand'}
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                {(item.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="max-w-32 truncate font-medium">
              {item.name || 'Unknown'}
            </span>
          </Link>
        ),
      },
      {
        className: 'text-right',
        header: 'Posts',
        key: 'totalPosts',
        render: (item) => (
          <span className="font-mono">{item.totalPosts.toLocaleString()}</span>
        ),
      },
      {
        className: 'text-right',
        header: 'Engagement',
        key: 'totalEngagement',
        render: (item) => (
          <span className="font-mono">
            {item.totalEngagement.toLocaleString()}
          </span>
        ),
      },
    ],
    [brandsLeaderboard, basePath],
  );

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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-foreground/60">
                {dashboardState === 'active' ? (
                  <HiOutlineCheckCircle className="h-4 w-4 text-emerald-400" />
                ) : dashboardState === 'warming_up' ? (
                  <HiMiniArrowTrendingUp className="h-4 w-4 text-amber-300" />
                ) : (
                  <HiOutlineInformationCircle className="h-4 w-4 text-sky-300" />
                )}
                {heroContent.badge}
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-serif leading-tight text-foreground lg:text-4xl">
                  {heroContent.title}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-foreground/72 lg:text-base">
                  {heroContent.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={heroContent.primaryAction.href}
                  className={buttonVariants({
                    size: ButtonSize.SM,
                    variant: heroContent.primaryAction.variant,
                  })}
                >
                  {heroContent.primaryAction.label}
                </Link>
                <Link
                  href="/settings/organization/credentials"
                  className={buttonVariants({
                    size: ButtonSize.SM,
                    variant: ButtonVariant.SECONDARY,
                  })}
                >
                  Manage connections
                </Link>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 lg:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Setup progress
                  </div>
                  <div className="text-xs text-foreground/55">
                    What this date range can currently support
                  </div>
                </div>
                <HiOutlineSquares2X2 className="h-5 w-5 text-foreground/45" />
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {heroContent.progressItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-white/[0.08] bg-black/10 p-4"
                  >
                    <div className="text-xs uppercase tracking-[0.22em] text-foreground/40">
                      {item.label}
                    </div>
                    <div className="mt-2 text-3xl font-serif text-foreground">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {healthAlertMessage && (
          <Alert type={AlertCategory.WARNING}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">{healthAlertMessage}</div>
                {healthCheckedAt && (
                  <div className="text-xs text-foreground/70">
                    Last checked {format(new Date(healthCheckedAt), 'PPpp')}
                  </div>
                )}
              </div>
              <Button
                label="Retry checks"
                variant={ButtonVariant.OUTLINE}
                onClick={runHealthChecks}
              />
            </div>
          </Alert>
        )}

        {isUsingAnyCache && (
          <Alert type={AlertCategory.WARNING}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">
                  Live analytics are temporarily unavailable.
                </div>
                <div className="text-xs text-foreground/70">
                  Showing cached data{cachedLabel ? ` from ${cachedLabel}` : ''}
                  .
                </div>
              </div>
              <Button
                label="Retry data"
                variant={ButtonVariant.OUTLINE}
                onClick={retryAllData}
              />
            </div>
          </Alert>
        )}

        {hasAnalyticsError && !isUsingAnyCache && (
          <Alert type={AlertCategory.ERROR}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">Analytics failed to load.</div>
                <div className="text-xs text-foreground/70">
                  Please retry or check service status.
                </div>
              </div>
              <Button
                label="Retry analytics"
                variant={ButtonVariant.OUTLINE}
                onClick={retryAllData}
              />
            </div>
          </Alert>
        )}

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
              href: '/settings/organization/credentials',
              label: 'Check connections',
              variant: ButtonVariant.SECONDARY,
            }}
          />
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {hasTopPosts || isTopPostsLoading ? (
            <TopPostsSection
              posts={topPosts}
              isLoading={isTopPostsLoading}
              basePath="/posts"
            />
          ) : (
            <OverviewPlaceholderCard
              title="Top posts will surface here"
              description="As soon as posts start collecting views and engagement, this module will highlight the strongest creative in the selected range."
              icon={HiOutlineNewspaper}
              primaryAction={{
                href: '/posts',
                label: 'Draft content',
                variant: ButtonVariant.DEFAULT,
              }}
              secondaryAction={{
                href: '/posts?status=public',
                label: 'Browse published posts',
                variant: ButtonVariant.SECONDARY,
              }}
            />
          )}

          <div
            className={cn(
              'grid grid-cols-1 gap-4',
              scope === PageScope.SUPERADMIN
                ? 'md:grid-cols-2 lg:col-span-2'
                : 'lg:col-span-2',
            )}
          >
            {scope === PageScope.SUPERADMIN &&
              (hasOrgLeaderboard || isLeaderboardLoading ? (
                <Card variant={CardVariant.DEFAULT} bodyClassName="p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                      Top organizations
                    </h3>
                    <Link
                      href={`${basePath}/organizations`}
                      className={cn(
                        buttonVariants({
                          size: ButtonSize.XS,
                          variant: ButtonVariant.SECONDARY,
                        }),
                        'uppercase tracking-wide',
                      )}
                    >
                      View all
                    </Link>
                  </div>

                  <AppTable<IOrgLeaderboardItem>
                    items={orgsLeaderboard}
                    isLoading={isLeaderboardLoading}
                    columns={orgsColumns}
                    getRowKey={(item, index) =>
                      `${item.organization.id}-${index}`
                    }
                    emptyLabel="No organizations found"
                  />
                </Card>
              ) : (
                <OverviewPlaceholderCard
                  title="Organization rankings need more tracked activity"
                  description="Once organizations start producing enough measurable performance, this leaderboard will rank them by output and engagement."
                  icon={HiOutlineUsers}
                  primaryAction={{
                    href: `${basePath}/organizations`,
                    label: 'Review organizations',
                    variant: ButtonVariant.SECONDARY,
                  }}
                />
              ))}

            {hasBrandLeaderboard || isLeaderboardLoading ? (
              <Card variant={CardVariant.DEFAULT} bodyClassName="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                    Top brands
                  </h3>
                  <Link
                    href={`${basePath}/brands`}
                    className={cn(
                      buttonVariants({
                        size: ButtonSize.XS,
                        variant: ButtonVariant.SECONDARY,
                      }),
                      'uppercase tracking-wide',
                    )}
                  >
                    View all
                  </Link>
                </div>

                <AppTable<IBrandWithStats>
                  items={brandsLeaderboard}
                  isLoading={isLeaderboardLoading}
                  columns={brandsColumns}
                  getRowKey={(item, index) => `${item.id}-${index}`}
                  emptyLabel="No brands found"
                />
              </Card>
            ) : (
              <OverviewPlaceholderCard
                title="Brand rankings will unlock after the first measurable wins"
                description="This section compares brands once posts begin generating enough views and engagement to rank meaningfully."
                icon={HiOutlineSparkles}
                primaryAction={{
                  href: `${basePath}/brands`,
                  label: 'Review brands',
                  variant: ButtonVariant.SECONDARY,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
