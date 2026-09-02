'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAdminStats } from '@hooks/data/analytics/use-admin-stats/use-admin-stats';
import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Building2, CreditCard, Newspaper, Tag, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Lazy-load the chart component to avoid bundling recharts in the initial chunk
const ActivityChart = dynamic(
  () => import('@protected/overview/dashboard/activity-chart'),
  { ssr: false },
);

function formatNumber(num: number | undefined): string {
  if (num === undefined) {
    return '—';
  }
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

// Quick action cards with B&W styling
const quickActionCards: OverviewCard[] = [
  {
    color: 'bg-muted/50 text-foreground',
    cta: 'Manage Users',
    description: 'Accounts, roles, and permissions',
    href: APP_ROUTES.ADMIN.ADMINISTRATION.USERS,
    icon: Users,
    id: 'users',
    label: 'Users',
  },
  {
    color: 'bg-muted/50 text-foreground',
    cta: 'View Elements',
    description: 'Presets, blacklists, and settings',
    href: APP_ROUTES.ADMIN.CONFIGURATION.ELEMENTS_BLACKLISTS,
    icon: Tag,
    id: 'elements',
    label: 'Elements',
  },
  {
    color: 'bg-muted/50 text-foreground',
    cta: 'View Posts',
    description: 'Posts, performance, and metrics',
    href: APP_ROUTES.ADMIN.CONTENT.POSTS,
    icon: Newspaper,
    id: 'posts',
    label: 'Posts',
  },
];

// ActivityChart is lazy-loaded via dynamic import (see top of file)

// Organization type labels for metadata display
const orgTypes = [
  'Enterprise AI',
  'Creative Node',
  'Digital Studio',
  'Content Lab',
  'Media Network',
];

interface LeaderboardCardProps {
  data: {
    rank: number;
    organization: { id: string; name: string; logo?: string };
    totalPosts: number;
    growth: number;
  }[];
  isLoading: boolean;
}

function LeaderboardCard({ data, isLoading }: LeaderboardCardProps) {
  return (
    <WorkspaceSurface
      eyebrow="Volume Ranking"
      title="Top Organizations"
      tone="muted"
      className="h-full"
      data-testid="admin-overview-leaderboard"
    >
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[
              'leaderboard-skeleton-1',
              'leaderboard-skeleton-2',
              'leaderboard-skeleton-3',
              'leaderboard-skeleton-4',
              'leaderboard-skeleton-5',
            ].map((skeletonId) => (
              <div
                key={skeletonId}
                className="h-14 bg-foreground/5 animate-pulse"
              />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-8">
            No organization data available
          </div>
        ) : (
          data.map((org, index) => (
            <div
              key={org.organization.id}
              className={cn(
                'flex items-center justify-between py-3 px-3',
                'bg-foreground/[0.02] hover:bg-muted/40',
                'transition-colors duration-150',
              )}
            >
              <div className="flex items-center gap-4">
                {/* White numbered badge */}
                <span className="text-gray-800 text-xs font-black w-6">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {/* Icon circle */}
                <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                  <Building2 className="size-5 text-muted-foreground" />
                </div>
                {/* Name and metadata */}
                <div>
                  <div className="font-bold text-sm uppercase">
                    {org.organization.name}
                  </div>
                  <div className="text-gray-800 text-xs uppercase tracking-widest">
                    {orgTypes[index % orgTypes.length]}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {org.totalPosts.toLocaleString()} posts
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    org.growth > 0
                      ? 'bg-success/10 text-success'
                      : org.growth < 0
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {org.growth > 0 ? '+' : ''}
                  {org.growth}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* View All Entities CTA button */}
      <Button
        type="button"
        variant={ButtonVariant.SECONDARY}
        className="w-full mt-6 py-4 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-muted/70 transition-colors"
      >
        View All Entities
      </Button>
    </WorkspaceSurface>
  );
}

interface StatsGridProps {
  stats: {
    totalBrands: number;
    pendingPosts: number;
    activeWorkflows: number;
    activeBots: number;
    totalModels: number;
    recentActivities: number;
  };
  isLoading: boolean;
}

function StatsGrid({ stats, isLoading }: StatsGridProps) {
  const statsItems = [
    {
      label: 'Active Brands',
      value: formatNumber(stats.totalBrands || 0),
    },
    {
      label: 'Pending Posts',
      value: formatNumber(stats.pendingPosts || 0),
    },
    {
      label: 'Active Workflows',
      value: formatNumber(stats.activeWorkflows || 0),
    },
    {
      label: 'Running Bots',
      value: formatNumber(stats.activeBots || 0),
    },
    {
      label: 'AI Models',
      value: formatNumber(stats.totalModels || 0),
    },
    {
      label: 'Recent Activities',
      value: formatNumber(stats.recentActivities || 0),
    },
  ];

  return (
    <WorkspaceSurface
      eyebrow="Operational Snapshot"
      title="Quick Stats"
      tone="muted"
      data-testid="admin-overview-stats"
    >
      <MetricCardGrid columns={6}>
        {statsItems.map((stat) => (
          <MetricCard
            key={stat.label}
            isLoading={isLoading}
            label={stat.label}
            size="sm"
            value={stat.value}
          />
        ))}
      </MetricCardGrid>
    </WorkspaceSurface>
  );
}

function QuickActionsGrid() {
  return (
    <WorkspaceSurface
      eyebrow="Command Deck"
      title="Quick Actions"
      tone="muted"
      data-testid="admin-overview-quick-actions"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {quickActionCards.map((card) => (
          <Link
            href={card.href || '#'}
            key={card.label}
            className={cn(
              'group relative block h-full rounded-[1.35rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <Card
              label={card.label}
              description={card.description}
              bodyClassName="flex h-full flex-col justify-between p-6"
              icon={card.icon}
              iconWrapperClassName={cn('p-3', card.color)}
              className="h-full text-left transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-border-strong"
              data-testid="admin-overview-quick-action"
            >
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm text-muted-foreground">
                <span>{card.cta}</span>
                <span className="text-foreground transition-colors group-hover:text-primary">
                  Open
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </WorkspaceSurface>
  );
}

export default function OverviewPage() {
  const { stats, leaderboard, timeseries, isLoading } = useAdminStats();

  // Build KPI items from real data with trends
  // Use monthlyGrowth as general indicator, with fallback values for display
  const monthlyGrowth = stats?.monthlyGrowth || 0;
  const kpiItems: KPICardProps[] = [
    {
      icon: Users,
      label: 'Total Users',
      trend: monthlyGrowth > 0 ? 12 : -5,
      value: formatNumber(stats?.totalUsers),
    },
    {
      icon: Building2,
      label: 'Organizations',
      trend: monthlyGrowth > 0 ? 8 : -3,
      value: formatNumber(stats?.totalOrganizations),
    },
    {
      icon: Newspaper,
      label: 'Total Posts',
      trend: monthlyGrowth > 0 ? 24 : monthlyGrowth,
      value: formatNumber(stats?.totalPosts),
    },
    {
      icon: CreditCard,
      label: 'Subscriptions',
      trend: monthlyGrowth > 0 ? 15 : -2,
      value: formatNumber(stats?.totalSubscriptions),
    },
  ];

  // Breadcrumb owns identity (Admin / Dashboard). No second page title,
  // no hr dividers, no page-only dots — stack surfaces like workspace home.
  return (
    <Container label="Dashboard" titleVisibility="sr-only">
      <div className="flex w-full flex-col gap-5">
        <KPISection
          items={kpiItems}
          gridCols={{ desktop: 4, mobile: 1, tablet: 2 }}
          className="mb-0"
          isLoading={isLoading}
        />

        <StatsGrid
          stats={{
            activeBots: stats?.activeBots || 0,
            activeWorkflows: stats?.activeWorkflows || 0,
            pendingPosts: stats?.pendingPosts || 0,
            recentActivities: stats?.recentActivities || 0,
            totalBrands: stats?.totalBrands || 0,
            totalModels: stats?.totalModels || 0,
          }}
          isLoading={isLoading}
        />

        <QuickActionsGrid />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ActivityChart data={timeseries} isLoading={isLoading} />
          <LeaderboardCard data={leaderboard} isLoading={isLoading} />
        </div>
      </div>
    </Container>
  );
}
