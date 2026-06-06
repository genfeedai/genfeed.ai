'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  PageScope,
} from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { TopPostData } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import type { TableColumn } from '@props/ui/display/table.props';
import type {
  IBrandWithStats,
  IOrgLeaderboardItem,
} from '@services/analytics/analytics.service';
import TopPostsSection from '@ui/analytics/top-posts/TopPostsSection';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import { buttonVariants } from '@ui/primitives/button.variants';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import {
  HiOutlineNewspaper,
  HiOutlineSparkles,
  HiOutlineUsers,
} from 'react-icons/hi2';
import OverviewPlaceholderCard from './analytics-overview-placeholder-card';

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
                className="size-6 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs">
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
                className="size-6 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs">
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

  return (
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
                getRowKey={(item, index) => `${item.organization.id}-${index}`}
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
  );
}
