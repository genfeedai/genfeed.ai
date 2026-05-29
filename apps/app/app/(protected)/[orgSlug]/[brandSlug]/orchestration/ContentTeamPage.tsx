'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentCampaigns } from '@hooks/data/agent-campaigns/use-agent-campaigns';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  type AgentGoal,
  AgentGoalsService,
} from '@services/automation/agent-goals.service';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@services/automation/agent-strategies.service';
import { WorkflowsService } from '@services/automation/workflows.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import {
  HiOutlineRectangleGroup,
  HiOutlineUserGroup,
  HiOutlineViewColumns,
  HiPlus,
} from 'react-icons/hi2';
import ContentTeamCampaignsSection from './ContentTeamCampaignsSection';
import ContentTeamMemberCard from './ContentTeamMemberCard';
import ContentTeamSummaryCard from './ContentTeamSummaryCard';

type SummaryCardProps = {
  accent: string;
  href?: string;
  label: string;
  tone: string;
  value: string;
};

export default function ContentTeamPage() {
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const { brands } = useBrand();
  const {
    strategies,
    isLoading: isStrategiesLoading,
    refresh,
  } = useAgentStrategies();
  const { campaigns, isLoading: isCampaignsLoading } = useAgentCampaigns();
  const { activeRuns, reviewInbox, stats } = useOverviewBootstrap();

  const getStrategiesService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const getGoalsService = useAuthedService((token: string) =>
    AgentGoalsService.getInstance(token),
  );
  const getWorkflowsService = useAuthedService((token: string) =>
    WorkflowsService.getInstance(token),
  );

  const { data: goals = [] as AgentGoal[] } = useQuery<AgentGoal[]>({
    queryKey: ['agent-goals'],
    queryFn: async ({ signal }) => {
      const service = await getGoalsService();
      const result = await service.list();
      return signal.aborted ? [] : result;
    },
  });

  const { data: workflows = [] as Array<{ id: string }> } = useQuery<
    Array<{ id: string }>
  >({
    queryKey: ['workflows-list'],
    queryFn: async ({ signal }) => {
      const service = await getWorkflowsService();
      const result = await service.findAll();
      return signal.aborted ? [] : result;
    },
  });

  const strategiesById = useMemo(
    () => new Map(strategies.map((strategy) => [strategy.id, strategy])),
    [strategies],
  );

  const brandLabelsById = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand.label])),
    [brands],
  );

  const groupedStrategies = useMemo(() => {
    return strategies.reduce<Record<string, AgentStrategy[]>>(
      (groups, strategy) => {
        const key = strategy.teamGroup || 'Independent';
        groups[key] ??= [];
        groups[key].push(strategy);
        return groups;
      },
      {},
    );
  }, [strategies]);

  const dailyCreditBudget = useMemo(
    () =>
      strategies.reduce(
        (total, strategy) => total + (strategy.dailyCreditBudget ?? 0),
        0,
      ),
    [strategies],
  );

  const creditsUsedToday = useMemo(
    () =>
      strategies.reduce(
        (total, strategy) => total + (strategy.creditsUsedToday ?? 0),
        0,
      ),
    [strategies],
  );

  const scheduledPostsPerWeek = useMemo(
    () =>
      strategies.reduce(
        (total, strategy) => total + (strategy.postsPerWeek ?? 0),
        0,
      ),
    [strategies],
  );

  const activeGoal = useMemo(
    () => goals.find((goal) => goal.isActive) ?? goals[0],
    [goals],
  );

  const handleToggle = useCallback(
    async (strategyId: string) => {
      try {
        const service = await getStrategiesService();
        await service.toggle(strategyId);
        await refresh();
        notificationsService.success('Team member updated');
      } catch (error) {
        logger.error('Failed to toggle content team strategy', { error });
        notificationsService.error('Unable to update team member state');
      }
    },
    [getStrategiesService, notificationsService, refresh],
  );

  const handleRunNow = useCallback(
    async (strategyId: string) => {
      try {
        const service = await getStrategiesService();
        await service.runNow(strategyId);
        notificationsService.success('Run queued');
      } catch (error) {
        logger.error('Failed to trigger content team run', { error });
        notificationsService.error('Unable to queue run');
      }
    },
    [getStrategiesService, notificationsService],
  );

  const hqCards = useMemo<SummaryCardProps[]>(
    () => [
      {
        accent: activeGoal
          ? `${formatCompactNumber(activeGoal.currentValue)} of ${formatCompactNumber(activeGoal.targetValue)} ${activeGoal.metric.replace('_', ' ')}`
          : 'Set a company goal for the orchestrator to optimize against.',
        href: '/orchestration/orchestrator',
        label: 'Mission',
        tone: 'HQ',
        value: activeGoal?.label ?? 'No active goal',
      },
      {
        accent:
          reviewInbox.readyCount > 0
            ? `${reviewInbox.readyCount} ready and ${reviewInbox.pendingCount} still generating`
            : 'No reviews waiting right now.',
        href: '/posts/review',
        label: 'Review Queue',
        tone: 'Approval',
        value: String(reviewInbox.readyCount + reviewInbox.pendingCount),
      },
      {
        accent:
          scheduledPostsPerWeek > 0
            ? `${scheduledPostsPerWeek} planned outputs across ${strategies.length} specialists`
            : 'No publishing cadence configured yet.',
        href: '/orchestration/autopilot',
        label: 'Calendar Pressure',
        tone: 'Cadence',
        value: `${scheduledPostsPerWeek}/week`,
      },
      {
        accent: `${stats?.completedToday ?? 0} completed, ${stats?.failedToday ?? 0} failed, ${activeRuns.length} active`,
        href: '/orchestration/runs',
        label: 'Run Health',
        tone: 'Operations',
        value: String(stats?.totalRuns ?? strategies.length),
      },
      {
        accent:
          dailyCreditBudget > 0
            ? `${creditsUsedToday} used today across ${dailyCreditBudget} planned credits`
            : 'No credit allocation configured yet.',
        href: '/orchestration/campaigns',
        label: 'Budget Burn',
        tone: 'Finance',
        value: `${formatCompactNumber(creditsUsedToday)} / ${formatCompactNumber(dailyCreditBudget)}`,
      },
    ],
    [
      activeGoal,
      activeRuns.length,
      creditsUsedToday,
      dailyCreditBudget,
      reviewInbox.pendingCount,
      reviewInbox.readyCount,
      scheduledPostsPerWeek,
      stats?.completedToday,
      stats?.failedToday,
      stats?.totalRuns,
      strategies.length,
    ],
  );

  return (
    <Container
      description="Operate specialist content agents, orchestrated campaigns, and repeatable automations from one role-first control plane."
      icon={HiOutlineViewColumns}
      label="Content Team"
      right={
        <div className="flex flex-wrap gap-2">
          <PrimitiveButton
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          >
            <Link href="/orchestration/hire">
              <HiPlus /> Hire Agent
            </Link>
          </PrimitiveButton>
          <PrimitiveButton
            asChild
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
          >
            <Link href="/orchestration/orchestrator">
              <HiOutlineRectangleGroup /> Launch Orchestrator
            </Link>
          </PrimitiveButton>
        </div>
      }
    >
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            HQ
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Mission, review load, calendar pressure, run health, and budget
            burn.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {hqCards.map((card) => (
            <ContentTeamSummaryCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              Team
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Hire and manage role-specific agents grouped by function.
            </p>
          </div>
          <PrimitiveButton
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          >
            <Link href="/orchestration/hire">Hire Agent</Link>
          </PrimitiveButton>
        </div>

        {isStrategiesLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {['strategy-skeleton-1', 'strategy-skeleton-2'].map(
              (skeletonId) => (
                <div
                  key={skeletonId}
                  className="h-56 animate-pulse rounded-[1.25rem] border border-white/[0.08] bg-white/[0.04]"
                />
              ),
            )}
          </div>
        ) : strategies.length === 0 ? (
          <Card
            bodyClassName="flex flex-col items-start gap-4 p-6"
            description="Use the hire flow to spin up specialist agents for short-form, X, image, script, and avatar work."
            icon={HiOutlineUserGroup}
            iconWrapperClassName="bg-cyan-500/12 text-cyan-300"
            label="No team members yet"
          >
            <PrimitiveButton
              asChild
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
            >
              <Link href="/orchestration/hire">Hire Your First Agent</Link>
            </PrimitiveButton>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedStrategies).map(
              ([groupLabel, groupStrategies]) => (
                <div key={groupLabel} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                      {groupLabel}
                    </span>
                    <p className="text-sm text-foreground/50">
                      {groupStrategies.length} specialist
                      {groupStrategies.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {groupStrategies.map((strategy) => (
                      <ContentTeamMemberCard
                        key={strategy.id}
                        onRunNow={handleRunNow}
                        onToggle={handleToggle}
                        strategy={strategy}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <ContentTeamCampaignsSection
        campaigns={campaigns}
        isCampaignsLoading={isCampaignsLoading}
        strategiesById={strategiesById}
      />

      <section className="mt-10 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Automations
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Fixed workflows stay separate from adaptive campaigns and power
            repeatable pipelines.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ContentTeamSummaryCard
            accent={`${workflows.length} workflow${workflows.length === 1 ? '' : 's'} available for repeatable content ops.`}
            href={href('/workflows')}
            label="Workflow Templates"
            tone="Fixed Graphs"
            value={String(workflows.length)}
          />
          <ContentTeamSummaryCard
            accent={`${strategies.filter((strategy) => strategy.isActive).length} active specialists are eligible for adaptive runs.`}
            href="/orchestration/autopilot"
            label="Adaptive Policies"
            tone="Autopilot"
            value={String(
              strategies.filter((strategy) => strategy.isActive).length,
            )}
          />
          <ContentTeamSummaryCard
            accent={
              brandLabelsById.size > 0
                ? `${brandLabelsById.size} brand context${brandLabelsById.size === 1 ? '' : 's'} available for shared defaults.`
                : 'No brand context loaded.'
            }
            href="/posts/review"
            label="Review Inbox"
            tone="Approvals"
            value={String(reviewInbox.readyCount)}
          />
        </div>
      </section>
    </Container>
  );
}
