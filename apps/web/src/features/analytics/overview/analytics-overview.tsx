'use client';
import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  PageScope,
  Platform,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { Button } from '@ui/primitives/button';
import { ChartEmptyState } from '@ui/primitives/chart-empty-state';
import { EmptyState } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import { BLOCK_STACK_CLASS } from '@ui/styles/block-spacing';
import { ChartColumn } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import AnalyticsTopAccounts from '@/features/analytics/accounts/analytics-top-accounts';
import AnalyticsOverviewAlerts from './analytics-overview-alerts';
import AnalyticsOverviewHero from './analytics-overview-hero';
import AnalyticsOverviewLeaderboards from './analytics-overview-leaderboards';
import AnalyticsOverviewPerformanceDataset from './analytics-overview-performance-dataset';
import { useAnalyticsOverview } from './use-analytics-overview';

export interface AnalyticsOverviewProps {
  scope?: PageScope;
  basePath?: string;
}

const PlatformTimeSeriesChart = dynamic(
  () =>
    import(
      '@/features/analytics/components/analytics/charts/platform-time-series/platform-time-series-chart'
    ).then((mod) => mod.PlatformTimeSeriesChart),
  {
    loading: () => <Skeleton className="h-chart w-full" />,
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
}: AnalyticsOverviewProps) {
  const translate = useTranslations('pages.analytics.overview');
  const router = useRouter();
  const { href } = useOrgUrl();
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
  } = useAnalyticsOverview({ scope });

  const isEmptyOverview =
    scope !== PageScope.SUPERADMIN && dashboardState === 'empty';

  if (isEmptyOverview && !isLoading) {
    return (
      <EmptyState
        surface="card"
        icon={ChartColumn}
        title={translate('emptyTitle')}
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

      <div className={cn(BLOCK_STACK_CLASS, showAgentDashboard && 'hidden')}>
        {heroContent && !isLoading ? (
          <AnalyticsOverviewHero heroContent={heroContent} />
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
            gridCols={{ desktop: 4, mobile: 1 }}
            className="mb-0 bg-background"
            isLoading={isLoading}
            items={primaryKpiItems}
          />
        )}

        {secondaryKpiItems.length > 0 && (
          <KPISection
            gridCols={{ desktop: 2, mobile: 1 }}
            className="mb-0 bg-background"
            isLoading={isLoading}
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
            data-testid="analytics-overview-timeseries"
            variant={CardVariant.DEFAULT}
            isLoading={!hasTimeseriesData && isTimeseriesLoading}
            label={translate('timeseriesTitle')}
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
              isLoading={false}
              height={400}
            />
          </Card>
        ) : (
          <Card
            variant={CardVariant.DEFAULT}
            label={translate('timeseriesTitle')}
          >
            <div className="relative h-chart">
              <ChartEmptyState
                shape="area"
                title={translate('placeholderTitle')}
                description={translate('placeholderDescription')}
                actions={
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      asChild
                      size={ButtonSize.SM}
                      variant={ButtonVariant.DEFAULT}
                    >
                      <Link
                        href={
                          scope === PageScope.SUPERADMIN
                            ? APP_ROUTES.PUBLISHING.OVERVIEW
                            : href(APP_ROUTES.PUBLISHING.OVERVIEW)
                        }
                      >
                        {translate('createPost')}
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                    >
                      <Link href={connectAccountsHref}>
                        {translate('checkConnections')}
                      </Link>
                    </Button>
                  </div>
                }
              />
            </div>
          </Card>
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
