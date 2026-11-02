'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardEmptySize,
  CardVariant,
  PageScope,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingPostsFilterRoute,
} from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { TableColumn } from '@props/ui/display/table.props';
import type {
  IBrandWithStats,
  IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import { EmptyState } from '@ui/primitives/empty-state';
import { BLOCK_GAP_CLASS } from '@ui/styles/block-spacing';
import { Newspaper, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import AnalyticsBrandSummary from '@/features/analytics/brands-list/analytics-brand-summary';
import TopPostsSection from '@/features/analytics/components/analytics/top-posts/TopPostsSection';
import type { TopPostData } from '@/hooks/data/analytics/use-top-posts/use-top-posts';

type AnalyticsOverviewLeaderboardsProps = {
  basePath: string;
  brandsLeaderboard: IBrandWithStats[];
  hasBrandLeaderboard: boolean;
  hasOrgLeaderboard: boolean;
  hasTopPosts: boolean;
  isLeaderboardLoading: boolean;
  isTopPostsLoading: boolean;
  orgsLeaderboard: IOrgLeaderboardItem[];
  scope: PageScope;
  topPosts: TopPostData[];
};

export default function AnalyticsOverviewLeaderboards({
  basePath,
  brandsLeaderboard,
  hasBrandLeaderboard,
  hasOrgLeaderboard,
  hasTopPosts,
  isLeaderboardLoading,
  isTopPostsLoading,
  orgsLeaderboard,
  scope,
  topPosts,
}: AnalyticsOverviewLeaderboardsProps) {
  const { href } = useOrgUrl();
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const summaryT = useTranslations('ui.rowSidebar.analytics');
  const scopedBasePath =
    scope === PageScope.SUPERADMIN ? basePath : href(basePath);
  const publishingHref = (path: string) =>
    scope === PageScope.SUPERADMIN ? path : href(path);
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
            href={`${scopedBasePath}/organizations/${item.organization.id}`}
            className="flex items-center gap-2 hover:text-primary"
          >
            <Avatar
              alt={item.organization.name || 'Org'}
              name={item.organization.name}
              shape="square"
              size="sm"
              src={item.organization.logo}
            />
            <span className="max-w-32 truncate font-medium">
              {item.organization.name || 'Unknown'}
            </span>
          </Link>
        ),
      },
      {
        className: 'text-right',
        header: (
          <AnalyticsMetricLabel metric="posts">Posts</AnalyticsMetricLabel>
        ),
        key: 'totalPosts',
        render: (item) => (
          <span className="font-mono">
            {item.totalPosts.toLocaleString('en-US')}
          </span>
        ),
      },
      {
        className: 'text-right',
        header: (
          <AnalyticsMetricLabel metric="engagement">
            Engagement
          </AnalyticsMetricLabel>
        ),
        key: 'totalEngagement',
        render: (item) => (
          <span className="font-mono">
            {item.totalEngagement.toLocaleString('en-US')}
          </span>
        ),
      },
    ],
    [scopedBasePath],
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
            href={`${scopedBasePath}/brands/${item.id}`}
            className="flex items-center gap-2 hover:text-primary"
          >
            <Avatar
              alt={item.name || 'Brand'}
              name={item.name}
              shape="square"
              size="sm"
              src={item.logo}
            />
            <span className="max-w-32 truncate font-medium">
              {item.name || 'Unknown'}
            </span>
          </Link>
        ),
      },
      {
        className: 'text-right',
        header: (
          <AnalyticsMetricLabel metric="posts">Posts</AnalyticsMetricLabel>
        ),
        key: 'totalPosts',
        render: (item) => (
          <span className="font-mono">
            {item.totalPosts.toLocaleString('en-US')}
          </span>
        ),
      },
      {
        className: 'text-right',
        header: (
          <AnalyticsMetricLabel metric="engagement">
            Engagement
          </AnalyticsMetricLabel>
        ),
        key: 'totalEngagement',
        render: (item) => (
          <span className="font-mono">
            {item.totalEngagement.toLocaleString('en-US')}
          </span>
        ),
      },
    ],
    [brandsLeaderboard, scopedBasePath],
  );

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-3', BLOCK_GAP_CLASS)}>
      {hasTopPosts || isTopPostsLoading ? (
        <TopPostsSection
          posts={topPosts}
          isLoading={isTopPostsLoading}
          basePath={publishingHref(APP_ROUTES.PUBLISHING.ROOT)}
        />
      ) : (
        <EmptyState
          surface="card"
          size={CardEmptySize.SM}
          icon={Newspaper}
          title="Top posts will surface here"
          description="As soon as posts start collecting views and engagement, this module will highlight the strongest creative in the selected range."
          actions={
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              >
                <Link href={publishingHref(APP_ROUTES.PUBLISHING.OVERVIEW)}>
                  Draft content
                </Link>
              </Button>
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <Link
                  href={publishingHref(
                    createPublishingPostsFilterRoute({
                      publicationState: 'posted',
                    }),
                  )}
                >
                  Browse published posts
                </Link>
              </Button>
            </div>
          }
        />
      )}

      <div
        className={cn(
          'grid grid-cols-1',
          BLOCK_GAP_CLASS,
          scope === PageScope.SUPERADMIN
            ? 'md:grid-cols-2 lg:col-span-2'
            : 'lg:col-span-2',
        )}
      >
        {scope === PageScope.SUPERADMIN &&
          (hasOrgLeaderboard || isLeaderboardLoading ? (
            <Card
              variant={CardVariant.DEFAULT}
              isLoading={isLeaderboardLoading && !hasOrgLeaderboard}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                  Top organizations
                </h3>
                <Link
                  href={`${scopedBasePath}/organizations`}
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
                isLoading={false}
                framed={false}
                columns={orgsColumns}
                getRowKey={(item, index) => `${item.organization.id}-${index}`}
                emptyLabel="No organizations found"
                rowSidebar={{
                  getId: (item) => item.organization.id,
                  getSubtitle: (item) =>
                    summaryT('rankLabel', { rank: item.rank }),
                  getTitle: (item) =>
                    item.organization.name || rowSidebarT('unknown'),
                  kind: 'organization',
                  render: (item) => (
                    <TableRowSummary
                      facts={[
                        {
                          id: 'rank',
                          label: fieldsT('rank'),
                          value: item.rank,
                        },
                        {
                          id: 'posts',
                          label: fieldsT('posts'),
                          value: item.totalPosts.toLocaleString('en-US'),
                        },
                        {
                          id: 'engagement',
                          label: fieldsT('engagement'),
                          value: item.totalEngagement.toLocaleString('en-US'),
                        },
                      ]}
                      openHref={`${scopedBasePath}/organizations/${item.organization.id}`}
                      openLabel={summaryT('openOrganization')}
                    />
                  ),
                }}
              />
            </Card>
          ) : (
            <EmptyState
              surface="card"
              size={CardEmptySize.SM}
              icon={Users}
              title="Organization rankings need more tracked activity"
              description="Once organizations start producing enough measurable performance, this leaderboard will rank them by output and engagement."
              actions={
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    asChild
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  >
                    <Link href={`${scopedBasePath}/organizations`}>
                      Review organizations
                    </Link>
                  </Button>
                </div>
              }
            />
          ))}

        {hasBrandLeaderboard || isLeaderboardLoading ? (
          <Card
            variant={CardVariant.DEFAULT}
            isLoading={isLeaderboardLoading && !hasBrandLeaderboard}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Top brands
              </h3>
              <Link
                href={`${scopedBasePath}/brands`}
                className={buttonVariants({
                  size: ButtonSize.XS,
                  variant: ButtonVariant.SECONDARY,
                })}
              >
                View all
              </Link>
            </div>

            <AppTable<IBrandWithStats>
              items={brandsLeaderboard}
              isLoading={false}
              framed={false}
              columns={brandsColumns}
              getRowKey={(item, index) => `${item.id}-${index}`}
              emptyLabel="No brands found"
              rowSidebar={{
                getId: (item) => item.id,
                getSubtitle: (item) => item.organizationName,
                getTitle: (item) => item.name || rowSidebarT('unknown'),
                kind: 'brand',
                render: (item) => (
                  <AnalyticsBrandSummary
                    brand={item}
                    openHref={`${scopedBasePath}/brands/${item.id}`}
                  />
                ),
              }}
            />
          </Card>
        ) : (
          <EmptyState
            surface="card"
            size={CardEmptySize.SM}
            icon={Sparkles}
            title="Brand rankings will unlock after the first measurable wins"
            description="This section compares brands once posts begin generating enough views and engagement to rank meaningfully."
            actions={
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button
                  asChild
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                >
                  <Link href={`${scopedBasePath}/brands`}>Review brands</Link>
                </Button>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
