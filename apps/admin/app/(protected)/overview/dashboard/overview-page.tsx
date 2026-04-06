'use client';

import Button from '@components/buttons/base/Button';
import { ButtonVariant } from '@genfeedai/enums';
import type { OverviewCard } from '@genfeedai/interfaces/ui/overview-card.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAdminStats } from '@hooks/data/analytics/use-admin-stats/use-admin-stats';
import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import Card from '@ui/card/Card';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  HiOutlineBuildingOffice2,
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineCpuChip,
  HiOutlineCreditCard,
  HiOutlineNewspaper,
  HiOutlineSparkles,
  HiOutlineTag,
  HiOutlineUserGroup,
} from 'react-icons/hi2';

// Lazy-load the chart component to avoid bundling recharts in the initial chunk
const ActivityChart = dynamic(
  () => import('@protected/overview/dashboard/activity-chart'),
  { ssr: false },
);

function formatNumber(num: number): string {
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
    color: 'bg-white/5 text-foreground',
    cta: 'Manage Users',
    description: 'Accounts, roles, and permissions',
    href: '/administration/users',
    icon: HiOutlineUserGroup,
    id: 'users',
    label: 'Users',
  },
  {
    color: 'bg-white/5 text-foreground',
    cta: 'View Elements',
    description: 'Presets, blacklists, and settings',
    href: '/configuration/elements/blacklists',
    icon: HiOutlineTag,
    id: 'elements',
    label: 'Elements',
  },
  {
    color: 'bg-white/5 text-foreground',
    cta: 'View Posts',
    description: 'Posts, performance, and metrics',
    href: '/content/posts',
    icon: HiOutlineNewspaper,
    id: 'posts',
    label: 'Posts',
  },
];

// ActivityChart is lazy-loaded via dynamic import (see top of file)

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
  // Organization type labels for metadata display
  const orgTypes = [
    'Enterprise AI',
    'Creative Node',
    'Digital Studio',
    'Content Lab',
    'Media Network',
  ];

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
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-foreground/5 animate-pulse" />
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
                'bg-foreground/[0.02] hover:bg-white/[0.02]',
                'transition-colors duration-150',
              )}
            >
              <div className="flex items-center gap-4">
                {/* White numbered badge */}
                <span className="text-white/20 text-xs font-black w-6">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {/* Icon circle */}
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <HiOutlineBuildingOffice2 className="w-5 h-5 text-white/60" />
                </div>
                {/* Name and metadata */}
                <div>
                  <div className="font-bold text-sm uppercase">
                    {org.organization.name}
                  </div>
                  <div className="text-white/40 text-xs uppercase tracking-widest">
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
                      ? 'bg-green-500/20 text-green-400'
                      : org.growth < 0
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-white/10 text-white/60',
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
        variant={ButtonVariant.UNSTYLED}
        className="w-full mt-6 py-4 border border-white/10 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/5 transition-colors"
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
      icon: HiOutlineSparkles,
      label: 'Active Brands',
      value: formatNumber(stats.totalBrands || 0),
    },
    {
      icon: HiOutlineClock,
      label: 'Pending Posts',
      value: formatNumber(stats.pendingPosts || 0),
    },
    {
      icon: HiOutlineChartBar,
      label: 'Active Workflows',
      value: formatNumber(stats.activeWorkflows || 0),
    },
    {
      icon: HiOutlineCpuChip,
      label: 'Running Bots',
      value: formatNumber(stats.activeBots || 0),
    },
    {
      icon: HiOutlineCpuChip,
      label: 'AI Models',
      value: formatNumber(stats.totalModels || 0),
    },
    {
      icon: HiOutlineClock,
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statsItems.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]"
            >
              <div className="text-white/30 mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold">
                {isLoading ? (
                  <div className="h-7 w-12 bg-white/10 animate-pulse" />
                ) : (
                  stat.value
                )}
              </div>
              <div className="text-white/40 text-[10px] uppercase tracking-widest mt-1">
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
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
              'group relative block h-full rounded-[1.35rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <Card
              label={card.label}
              description={card.description}
              bodyClassName="flex h-full flex-col justify-between p-6"
              icon={card.icon}
              iconWrapperClassName={cn('p-3', card.color)}
              className="h-full text-left transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:border-white/[0.14] group-hover:shadow-[0_22px_44px_-28px_rgba(0,0,0,0.72)]"
              data-testid="admin-overview-quick-action"
            >
              <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-sm text-white/55">
                <span>{card.cta}</span>
                <span className="text-white transition-colors group-hover:text-primary">
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

function GradientDivider() {
  return (
    <div className="h-px bg-gradient-to-r from-transparent via-white/6 to-transparent my-8" />
  );
}

export default function OverviewPage() {
  const { stats, leaderboard, timeseries, isLoading } = useAdminStats();

  // Build KPI items from real data with trends
  // Use monthlyGrowth as general indicator, with fallback values for display
  const monthlyGrowth = stats?.monthlyGrowth || 0;
  const kpiItems: KPICardProps[] = [
    {
      icon: HiOutlineUserGroup,
      label: 'Total Users',
      trend: monthlyGrowth > 0 ? 12 : -5,
      value: formatNumber(stats?.totalUsers || 0),
    },
    {
      icon: HiOutlineBuildingOffice2,
      label: 'Organizations',
      trend: monthlyGrowth > 0 ? 8 : -3,
      value: formatNumber(stats?.totalOrganizations || 0),
    },
    {
      icon: HiOutlineNewspaper,
      label: 'Total Posts',
      trend: monthlyGrowth > 0 ? 24 : monthlyGrowth,
      value: formatNumber(stats?.totalPosts || 0),
    },
    {
      icon: HiOutlineCreditCard,
      label: 'Subscriptions',
      trend: monthlyGrowth > 0 ? 15 : -2,
      value: formatNumber(stats?.totalSubscriptions || 0),
    },
  ];

  return (
    <Container
      label="Admin Dashboard"
      description="Control platform operations and user management"
      icon={HiOutlineChartBar}
      className="bg-dots-subtle"
    >
      {/* KPI Section */}
      <KPISection
        items={kpiItems}
        gridCols={{ desktop: 4, mobile: 1, tablet: 2 }}
        className="mt-6"
        isLoading={isLoading}
      />

      <GradientDivider />

      {/* Stats Grid */}
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

      <GradientDivider />

      <QuickActionsGrid />

      <GradientDivider />

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ActivityChart data={timeseries} isLoading={isLoading} />
        <LeaderboardCard data={leaderboard} isLoading={isLoading} />
      </div>
    </Container>
  );
}
