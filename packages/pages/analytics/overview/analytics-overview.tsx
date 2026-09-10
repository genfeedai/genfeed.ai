'use client';

import {
  ButtonVariant,
  CardVariant,
  PageScope,
  Platform,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { TopPostData } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import AnalyticsTopAccounts from '@pages/analytics/accounts/analytics-top-accounts';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import type {
  IBrandWithStats,
  IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import Card from '@ui/card/Card';
import { EmptyStateCard } from '@ui/feedback';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { ChartColumn } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import AnalyticsOverviewAlerts from './analytics-overview-alerts';
import AnalyticsOverviewHero from './analytics-overview-hero';
import AnalyticsOverviewLeaderboards from './analytics-overview-leaderboards';
import AnalyticsOverviewPerformanceDataset from './analytics-overview-performance-dataset';
import OverviewPlaceholderCard from './analytics-overview-placeholder-card';
import { useAnalyticsOverview } from './use-analytics-overview';

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
  const translate = useTranslations('pages.analytics.overview');
  const router = useRouter();
  const {
    agentBlocks,
    brandsLeaderboard,
    cachedLabel,
    connectAccountsHref,
    currentUser,
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
    orgHref,
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
  } = useAnalyticsOverview({
    analytics: initialAnalytics,
    brandsLeaderboard: initialBrandsLeaderboard,
    cachedAt: initialCachedAt,
    orgsLeaderboard: initialOrgsLeaderboard,
    scope,
    timeseriesData: initialTimeseriesData,
    topPosts: initialTopPosts,
  });

  const isEmptyOverview =
    scope !== PageScope.SUPERADMIN && dashboardState === 'empty';

  if (isEmptyOverview) {
    if (isLoading) {
      return (
        <div
          className="h-48 w-full animate-pulse rounded-lg bg-muted/60"
          data-testid="analytics-overview-loading"
        />
      );
    }

    return (
      <EmptyStateCard
        icon={ChartColumn}
        title={translate('emptyTitle')}
        description={translate('emptyDescription')}
        action={{
          label: translate('connectAccounts'),
          onClick: () => router.push(connectAccountsHref),
        }}
      />
    );
  }

  return (
    <>
      <AnalyticsAgentDashboard
        agentBlocks={agentBlocks}
        currentUser={currentUser}
        disabled={scope === PageScope.SUPERADMIN}
        getLocalSnapshot={getLocalSnapshot}
        hydrateState={hydrateState}
        isAgentModified={isAgentModified}
        onResetToDefaults={resetToDefaults}
        persistState={persistAgentDashboardState}
        scope="organization"
        updateLocalUser={updateLocalUser}
      />

      <div
        className={cn('flex flex-col gap-6', showAgentDashboard && 'hidden')}
      >
        {heroContent && !isLoading ? (
          <AnalyticsOverviewHero
            dashboardState={dashboardState}
            heroContent={heroContent}
            orgHref={orgHref}
          />
        ) : null}

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
            gridCols={{ desktop: 4, mobile: 1, tablet: 2 }}
            className="mb-0 bg-background"
            isLoading={isLoading || isRefreshing}
            items={primaryKpiItems}
          />
        )}

        {secondaryKpiItems.length > 0 && (
          <KPISection
            gridCols={{ desktop: 2, mobile: 1, tablet: 2 }}
            className="mb-0 bg-background"
            isLoading={isLoading || isRefreshing}
            items={secondaryKpiItems}
          />
        )}

        {scope !== PageScope.SUPERADMIN ? (
          <>
            <AnalyticsTopAccounts />
            <AnalyticsOverviewPerformanceDataset />
          </>
        ) : null}

        {hasTimeseriesData || isTimeseriesLoading ? (
          <Card
            variant={CardVariant.DEFAULT}
            label={translate('timeseriesTitle')}
            description={translate('timeseriesDescription')}
          >
            <PlatformTimeSeriesChart
              data={timeseriesData}
              platforms={[
                Platform.INSTAGRAM,
                Platform.TIKTOK,
                Platform.YOUTUBE,
                Platform.TWITTER,
                Platform.FACEBOOK,
              ]}
              isLoading={isTimeseriesLoading}
              height={400}
            />
          </Card>
        ) : (
          <OverviewPlaceholderCard
            title={translate('placeholderTitle')}
            description={translate('placeholderDescription')}
            icon={ChartColumn}
            primaryAction={{
              href: APP_ROUTES.PUBLISHING.OVERVIEW,
              label: translate('createPost'),
              variant: ButtonVariant.DEFAULT,
            }}
            secondaryAction={{
              href: connectAccountsHref,
              label: translate('checkConnections'),
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
