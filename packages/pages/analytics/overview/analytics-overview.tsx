'use client';

import { ButtonVariant, CardVariant, PageScope } from '@genfeedai/enums';
import type { IAnalytics } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { TopPostData } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import type {
  IBrandWithStats,
  IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import Card from '@ui/card/Card';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import dynamic from 'next/dynamic';
import { HiOutlineChartBar } from 'react-icons/hi2';
import AnalyticsOverviewAlerts from './analytics-overview-alerts';
import AnalyticsOverviewHero from './analytics-overview-hero';
import AnalyticsOverviewLeaderboards from './analytics-overview-leaderboards';
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
  const {
    agentBlocks,
    brandsLeaderboard,
    cachedLabel,
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
    basePath,
    brandsLeaderboard: initialBrandsLeaderboard,
    cachedAt: initialCachedAt,
    orgsLeaderboard: initialOrgsLeaderboard,
    scope,
    timeseriesData: initialTimeseriesData,
    topPosts: initialTopPosts,
  });

  if (isLoading) {
    return <LazyLoadingFallback variant="grid" />;
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
