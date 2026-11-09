import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { useOptionalUser } from '@contexts/user/user-context/user-context';
import { useAgentDashboardStore } from '@genfeedai/agent/stores/agent-dashboard.store';
import {
  AnalyticsMetric,
  ButtonVariant,
  PageScope,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { DashboardScopePreferences } from '@genfeedai/contracts/interfaces';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { User } from '@models/auth/user.model';
import { UsersService } from '@services/organization/users.service';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef } from 'react';
import { useHealthChecks } from '@/features/analytics/hooks/use-health-checks/use-health-checks';
import { useTimeseries } from '@/features/analytics/hooks/use-timeseries/use-timeseries';
import type {
  AnalyticsDashboardState,
  AnalyticsOverviewHeroContent,
} from '@/features/analytics/props/analytics-overview-hero.props';
import { useAnalytics } from '@/hooks/data/analytics/use-analytics/use-analytics';
import { useLeaderboards } from '@/hooks/data/analytics/use-leaderboards/use-leaderboards';
import { useTopPosts } from '@/hooks/data/analytics/use-top-posts/use-top-posts';

const DB_DASHBOARD_SCOPE_KEY = 'organization';

export interface UseAnalyticsOverviewParams {
  scope: PageScope;
}

export function useAnalyticsOverview({ scope }: UseAnalyticsOverviewParams) {
  const translate = useTranslations('pages.analytics.overview');
  const agentBlocks = useAgentDashboardStore((s) => s.blocks);
  const isAgentModified = useAgentDashboardStore((s) => s.isAgentModified);
  const resetToDefaults = useAgentDashboardStore((s) => s.resetToDefaults);
  const hydrateState = useAgentDashboardStore((s) => s.hydrateState);
  const getLocalSnapshot = useAgentDashboardStore((s) => s.getLocalSnapshot);
  const userContext = useOptionalUser();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const { brandSlug, href, orgHref } = useOrgUrl();
  const { brandId } = useCollectionScope();
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
    scope,
    startDate,
  });

  const { healthAlertMessage, healthCheckedAt, runHealthChecks } =
    useHealthChecks();

  const {
    brandsLeaderboard: orgBrandsLeaderboard,
    fetchLeaderboards,
    isLeaderboardLoading,
    isLeaderboardUsingCache,
    leaderboardCachedAt,
    orgsLeaderboard,
  } = useLeaderboards({
    dateRange,
    scope,
  });
  // A brand page never ranks the organization's other brands.
  const brandsLeaderboard = useMemo(
    () => (scope === PageScope.BRAND ? [] : orgBrandsLeaderboard),
    [orgBrandsLeaderboard, scope],
  );

  const {
    fetchTimeseries,
    isTimeseriesLoading,
    isTimeseriesUsingCache,
    timeseriesCachedAt,
    timeseriesData,
  } = useTimeseries({
    dateRange,
    scope,
  });

  const {
    cachedAt: topPostsCachedAt,
    isLoading: isTopPostsLoading,
    isUsingCache: isTopPostsUsingCache,
    topPosts,
  } = useTopPosts({
    brandId: scope === PageScope.BRAND ? brandId : undefined,
    limit: 10,
    metric: AnalyticsMetric.VIEWS,
  });

  const retryAllData = useMemo(
    () => () => {
      refreshAnalytics().catch(() => undefined);
      fetchLeaderboards();
      fetchTimeseries();
    },
    [fetchLeaderboards, fetchTimeseries, refreshAnalytics],
  );

  const handledRefreshRef = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger !== handledRefreshRef.current) {
      handledRefreshRef.current = refreshTrigger;
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
          label: 'Total Subscriptions',
          value: analytics?.totalSubscriptions || 0,
        },
        {
          label: 'Total Users',
          value: analytics?.totalUsers || 0,
        },
        {
          label: 'Total Videos',
          value: analytics?.totalVideos || 0,
        },
        {
          label: 'Total Images',
          value: analytics?.totalImages || 0,
        },
        {
          analyticsMetric: 'posts' as const,
          label: 'Total Posts',
          value: analytics?.totalPosts || 0,
        },
        {
          label: 'Total Brands',
          value: analytics?.totalBrands || 0,
        },
      ];
    }

    return [
      {
        label: 'Connected Accounts',
        value: analytics?.totalCredentialsConnected || 0,
      },
      {
        analyticsMetric: 'posts' as const,
        label: 'Total Posts',
        value: analytics?.totalPosts || 0,
      },
      {
        analyticsMetric: 'views' as const,
        label: 'Total Views',
        trend:
          analytics?.totalViews && analytics?.viewsGrowth
            ? analytics.viewsGrowth
            : undefined,
        trendLabel: 'vs prev',
        value: analytics?.totalViews || 0,
      },
      {
        analyticsMetric: 'engagement' as const,
        label: 'Total Engagement',
        trend:
          analytics?.totalEngagement && analytics?.engagementGrowth
            ? analytics.engagementGrowth
            : undefined,
        trendLabel: 'vs prev',
        value: analytics?.totalEngagement || 0,
      },
      {
        analyticsMetric: 'engagementRate' as const,
        label: 'Avg Engagement Rate',
        value: `${(analytics?.avgEngagementRate || 0).toFixed(2)}%`,
      },
      {
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

  const dashboardState: AnalyticsDashboardState = useMemo(() => {
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

  const connectAccountsHref =
    scope === PageScope.SUPERADMIN
      ? orgHref(APP_ROUTES.SETTINGS.INTEGRATIONS)
      : brandSlug
        ? href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)
        : orgHref(APP_ROUTES.SETTINGS.BRANDS);

  const heroContent = useMemo<AnalyticsOverviewHeroContent | null>(() => {
    // Active dashboards need no status strip — metrics and charts carry the page.
    // Empty is a page-level blocker (EmptyState surface="card"), not a banner over zeros.
    // Warming_up keeps a compact badge + next-action row (no in-page H1;
    // the shell breadcrumb owns page identity).
    if (scope === PageScope.SUPERADMIN || dashboardState !== 'warming_up') {
      return null;
    }

    const createContentAction = {
      href: href(APP_ROUTES.PUBLISHING.OVERVIEW),
      label: translate('hero.createContent'),
    };

    // Posts can exist before any account is connected. The banner must then
    // match the zero on the Connected Accounts tile and point at connecting.
    if (!hasConnectedAccounts) {
      return {
        badge: translate('hero.notConnectedBadge'),
        description: translate('hero.notConnectedDescription'),
        hasConnectedAccounts: false,
        primaryAction: {
          href: connectAccountsHref,
          label: translate('connectAccounts'),
          variant: ButtonVariant.DEFAULT,
        },
        secondaryAction: {
          ...createContentAction,
          variant: ButtonVariant.SECONDARY,
        },
      };
    }

    return {
      badge: translate('hero.warmingUpBadge'),
      description: translate('hero.warmingUpDescription'),
      hasConnectedAccounts: true,
      primaryAction: { ...createContentAction, variant: ButtonVariant.DEFAULT },
      secondaryAction: {
        href: connectAccountsHref,
        label: translate('hero.manageConnections'),
        variant: ButtonVariant.SECONDARY,
      },
    };
  }, [
    connectAccountsHref,
    dashboardState,
    hasConnectedAccounts,
    href,
    scope,
    translate,
  ]);

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

  return {
    agentBlocks,
    analytics,
    brandsLeaderboard,
    cachedLabel,
    connectAccountsHref,
    currentUser: userContext?.currentUser ?? null,
    dashboardState,
    hasAnalyticsError,
    hasBrandLeaderboard,
    hasOrgLeaderboard,
    hasTimeseriesData,
    hasTopPosts,
    healthAlertMessage,
    healthCheckedAt,
    heroContent,
    hydrateState,
    isAgentModified,
    isLeaderboardLoading,
    isLoading,
    isRefreshing,
    isTimeseriesLoading,
    isTopPostsLoading,
    isUsingAnyCache,
    orgsLeaderboard,
    persistAgentDashboardState,
    primaryKpiItems,
    resetToDefaults,
    retryAllData,
    runHealthChecks,
    secondaryKpiItems,
    showAgentDashboard,
    timeseriesData,
    topPosts,
    updateLocalUser,
    getLocalSnapshot,
  };
}
