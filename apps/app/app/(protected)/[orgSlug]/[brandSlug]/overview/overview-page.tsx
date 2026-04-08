'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { OverviewCard } from '@genfeedai/interfaces/ui/overview-card.interface';
import type { AgentRunStats } from '@genfeedai/types';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import type {
  PlatformTimeSeriesDataPoint,
  SocialPlatform,
} from '@props/analytics/charts.props';
import Card from '@ui/card/Card';
import CardIcon from '@ui/card/icon/CardIcon';
import OverviewLayout from '@ui/overview/OverviewLayout';
import { Button } from '@ui/primitives/button';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { useMemo } from 'react';
import {
  HiOutlineArrowTrendingUp,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentCheck,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineHome,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSparkles,
} from 'react-icons/hi2';
import {
  OverviewOperationsSection,
  OverviewPerformanceChartSection,
  OverviewPublishingInboxSection,
  OverviewTopStatStrip,
} from './overview-dashboard-sections';

interface SectionStat {
  label: string;
  value: string;
}

const OVERVIEW_SOCIAL_PLATFORMS: SocialPlatform[] = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
  'linkedin',
  'reddit',
  'pinterest',
  'medium',
];

function isSocialPlatform(value: string): value is SocialPlatform {
  return OVERVIEW_SOCIAL_PLATFORMS.includes(value as SocialPlatform);
}

function getChartPlatforms(
  series: PlatformTimeSeriesDataPoint[],
  activePlatforms?: string[],
): SocialPlatform[] {
  const preferred = (activePlatforms ?? [])
    .map((platform) => platform.toLowerCase())
    .filter(isSocialPlatform);

  if (preferred.length > 0) {
    return preferred;
  }

  const discovered = OVERVIEW_SOCIAL_PLATFORMS.filter((platform) =>
    series.some((point) => Number(point[platform] ?? 0) > 0),
  );

  if (discovered.length > 0) {
    return discovered;
  }

  return ['instagram', 'tiktok', 'youtube', 'twitter'];
}

interface SectionSummaryCardProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  stats: SectionStat[];
  href: string;
  color: string;
  kicker?: string;
}

function SectionSummaryCard({
  icon: Icon,
  label,
  stats,
  href,
  color,
  kicker,
}: SectionSummaryCardProps) {
  return (
    <Card
      className="flex h-full flex-col justify-between gap-5 shadow-none"
      bodyClassName="flex h-full flex-col justify-between gap-5 p-4"
    >
      <div>
        <div className="mb-4 flex items-center gap-3">
          <CardIcon
            icon={Icon}
            className={cn(
              'flex h-10 w-10 items-center justify-center border border-white/[0.12]',
              color,
            )}
            iconClassName="h-5 w-5"
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
              {kicker ?? 'Control Plane'}
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground">
              {label}
            </h3>
          </div>
        </div>

        <div className="space-y-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-foreground/40">{stat.label}</span>
              <span className="font-medium text-foreground">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <Button
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="text-xs tracking-[0.12em]"
        >
          <Link href={href}>View</Link>
        </Button>
      </div>
    </Card>
  );
}

function buildSectionSummaries(
  analytics: Partial<IAnalytics>,
): SectionSummaryCardProps[] {
  return [
    {
      color: 'bg-blue-500/12 text-blue-300',
      href: getPublisherPostsHref(),
      icon: HiOutlineDocumentText,
      kicker: 'Create',
      label: 'Content',
      stats: [
        {
          label: 'Total Posts',
          value: formatCompactNumber(analytics.totalPosts),
        },
        {
          label: 'Pending Review',
          value: String(analytics.pendingPosts || 0),
        },
        {
          label: 'Monthly Growth',
          value: `${analytics.monthlyGrowth || 0}%`,
        },
      ],
    },
    {
      color: 'bg-emerald-500/12 text-emerald-300',
      href: '/analytics/overview',
      icon: HiOutlineChartBar,
      kicker: 'Measure',
      label: 'Analytics',
      stats: [
        {
          label: 'Total Views',
          value: formatCompactNumber(analytics.totalViews),
        },
        {
          label: 'Views Growth',
          value: `${analytics.viewsGrowth || 0}%`,
        },
        {
          label: 'Best Platform',
          value: analytics.bestPerformingPlatform || '—',
        },
      ],
    },
    {
      color: 'bg-violet-500/12 text-violet-300',
      href: '/orchestration/overview',
      icon: HiOutlineCog6Tooth,
      kicker: 'Automate',
      label: 'Automation',
      stats: [
        {
          label: 'Active Workflows',
          value: String(analytics.activeWorkflows || 0),
        },
        {
          label: 'Active Bots',
          value: String(analytics.activeBots || 0),
        },
        {
          label: 'Pending Posts',
          value: String(analytics.pendingPosts || 0),
        },
      ],
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
      href: '/library/images',
      icon: HiOutlinePhoto,
      kicker: 'Reuse',
      label: 'Library',
      stats: [
        {
          label: 'Total Images',
          value: formatCompactNumber(analytics.totalImages),
        },
        {
          label: 'Total Videos',
          value: formatCompactNumber(analytics.totalVideos),
        },
      ],
    },
  ];
}

interface OverviewPageContentProps {
  initialActiveRuns?: IAgentRun[];
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: ReturnType<typeof useOverviewBootstrap>['reviewInbox'];
  initialRuns?: IAgentRun[];
  initialStats?: AgentRunStats | null;
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
}

export default function OverviewPageContent({
  initialActiveRuns = [],
  initialAnalytics,
  initialReviewInbox,
  initialRuns = [],
  initialStats = null,
  initialTimeSeriesData = [],
}: OverviewPageContentProps) {
  const {
    activeRuns,
    analytics,
    reviewInbox,
    runs,
    stats,
    timeSeriesData,
    isLoading,
  } = useOverviewBootstrap({
    initialActiveRuns,
    initialAnalytics,
    initialReviewInbox,
    initialRuns,
    initialStats,
    initialTimeSeriesData,
    revalidateOnMount: false,
  });

  const sectionSummaries = useMemo(
    () => buildSectionSummaries(analytics),
    [analytics],
  );

  const topStats = useMemo(
    () => [
      {
        accent: `${stats?.completedToday ?? 0} completed today`,
        label: 'Live Runs',
        value: String(stats?.activeRuns ?? activeRuns.length),
      },
      {
        accent: `${reviewInbox.pendingCount} still generating`,
        label: 'Ready To Review',
        value: String(reviewInbox.readyCount),
      },
      {
        accent: analytics.bestPerformingPlatform
          ? `${analytics.bestPerformingPlatform} leads performance`
          : 'Connect more channels for ranking',
        label: 'Connected Platforms',
        value: String(analytics.totalCredentialsConnected ?? 0),
      },
      {
        accent: `${stats?.failedToday ?? 0} failed today`,
        label: 'Credits Today',
        value: formatCompactNumber(stats?.totalCreditsToday ?? 0),
      },
    ],
    [
      activeRuns.length,
      analytics,
      reviewInbox.pendingCount,
      reviewInbox.readyCount,
      stats,
    ],
  );

  const operationRuns = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...activeRuns, ...runs].filter((run) => {
      if (seen.has(run.id)) {
        return false;
      }

      seen.add(run.id);
      return true;
    });

    return merged;
  }, [activeRuns, runs]);

  const chartPlatforms = useMemo(
    () => getChartPlatforms(timeSeriesData, analytics.activePlatforms),
    [analytics.activePlatforms, timeSeriesData],
  );

  const cards = useMemo<OverviewCard[]>(
    () => [
      {
        color: 'bg-sky-500/18 text-sky-200',
        cta: 'Open Research',
        description: 'Start with the strongest live signals',
        href: '/research/discovery',
        icon: HiOutlineArrowTrendingUp,
        id: 'trends',
        label: 'Research',
      },
      {
        color: 'bg-emerald-500/18 text-emerald-200',
        cta: 'Create Posts',
        description: 'Draft new posts, articles, and campaign assets',
        href: COMPOSE_ROUTES.ROOT,
        icon: HiOutlineChatBubbleLeftRight,
        id: 'create',
        label: 'Posts',
      },
      {
        color: 'bg-amber-500/18 text-amber-200',
        cta: 'Open Inbox',
        description:
          reviewInbox.readyCount > 0
            ? `${reviewInbox.readyCount} items are ready to review before posting`
            : 'No assets are waiting for review right now',
        href: '/posts/review',
        icon: HiOutlineClipboardDocumentCheck,
        id: 'review',
        label: 'Publishing Inbox',
      },
      {
        color: 'bg-cyan-500/18 text-cyan-200',
        cta: 'Open Schedule',
        description: 'Manage drafts, scheduled posts, and publishing windows',
        href: '/posts?status=scheduled',
        icon: HiOutlineCalendar,
        id: 'schedule',
        label: 'Schedule',
      },
      {
        color: 'bg-violet-500/18 text-violet-200',
        cta: 'View Analytics',
        description: 'Track cross-platform performance',
        href: '/analytics/overview',
        icon: HiOutlineChartBar,
        id: 'analytics',
        label: 'Analytics',
      },
      {
        color: 'bg-fuchsia-500/18 text-fuchsia-200',
        cta: 'Open Remix',
        description: 'Turn winners into follow-ups and fresh variants',
        href: '/posts/remix',
        icon: HiOutlinePlayCircle,
        id: 'remix',
        label: 'Remix',
      },
      {
        color: 'bg-rose-500/18 text-rose-200',
        cta: 'Open Agents',
        description: 'Monitor agent runs, workflows, and brand operations',
        href: '/orchestration/runs',
        icon: HiOutlineSparkles,
        id: 'automations',
        label: 'Agents',
      },
    ],
    [reviewInbox.readyCount],
  );

  const header = (
    <div className="mt-8 space-y-8">
      <div className="space-y-8">
        <OverviewTopStatStrip items={topStats} />

        <div className="grid gap-6 xl:grid-cols-2 xl:items-stretch">
          <div className="min-w-0">
            <OverviewPerformanceChartSection
              data={timeSeriesData}
              isLoading={isLoading}
              platforms={chartPlatforms}
            />
          </div>

          <div className="min-w-0">
            <OverviewOperationsSection runs={operationRuns} />
          </div>
        </div>

        <div className="min-w-0">
          <OverviewPublishingInboxSection
            readyCount={reviewInbox.readyCount}
            recentItems={reviewInbox.recentItems}
          />
        </div>
      </div>

      <section>
        <div className="mb-5 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
            Closed-Loop Snapshot
          </p>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Secondary Operating Summaries
          </h2>
        </div>
        <div
          data-testid="overview-secondary-summary"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {sectionSummaries.map((section) => (
            <SectionSummaryCard key={section.label} {...section} />
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <OverviewLayout
      label="Overview"
      description="Run the closed loop from trend discovery to publishing and automation."
      icon={HiOutlineHome}
      cards={cards}
      header={header}
    />
  );
}
