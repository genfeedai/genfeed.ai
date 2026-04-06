'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentCampaigns } from '@hooks/data/agent-campaigns/use-agent-campaigns';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
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
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useMemo } from 'react';
import {
  HiOutlinePlayCircle,
  HiOutlineRectangleGroup,
  HiOutlineUserGroup,
  HiOutlineViewColumns,
  HiPlus,
} from 'react-icons/hi2';

interface SummaryCardProps {
  accent: string;
  href?: string;
  label: string;
  tone: string;
  value: string;
}

function SummaryCard({ accent, href, label, tone, value }: SummaryCardProps) {
  return (
    <Card className="h-full" bodyClassName="space-y-3 p-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
          {tone}
        </p>
        <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">
          {label}
        </h3>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
          {value}
        </p>
        <p className="text-sm leading-6 text-foreground/60">{accent}</p>
      </div>
      {href ? (
        <div className="pt-2">
          <AppLink
            className="text-xs tracking-[0.12em]"
            label="Open"
            size={ButtonSize.SM}
            url={href}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
      ) : null}
    </Card>
  );
}

function TeamMemberCard({
  strategy,
  onRunNow,
  onToggle,
}: {
  onRunNow: (strategyId: string) => Promise<void>;
  onToggle: (strategyId: string) => Promise<void>;
  strategy: AgentStrategy;
}) {
  const lastRunLabel = strategy.lastRunAt
    ? formatDistanceToNow(new Date(strategy.lastRunAt), { addSuffix: true })
    : 'Never';

  return (
    <Card
      className="h-full"
      bodyClassName="flex h-full flex-col justify-between gap-5 p-4"
      label={strategy.label}
      description={strategy.displayRole ?? strategy.agentType}
      headerAction={
        <span
          className={
            strategy.isActive
              ? 'inline-flex rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300'
              : 'inline-flex rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50'
          }
        >
          {strategy.isActive ? 'Active' : 'Paused'}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-foreground/45">Budget</p>
          <p className="mt-1 font-medium text-foreground">
            {formatCompactNumber(strategy.creditsUsedToday)} /{' '}
            {formatCompactNumber(strategy.dailyCreditBudget)}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Reports To</p>
          <p className="mt-1 font-medium text-foreground">
            {strategy.reportsToLabel || 'Main Orchestrator'}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Platforms</p>
          <p className="mt-1 font-medium text-foreground">
            {strategy.platforms.length > 0
              ? strategy.platforms.join(', ')
              : 'Not set'}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Last Run</p>
          <p className="mt-1 font-medium text-foreground">{lastRunLabel}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-4">
        <Button
          icon={<HiOutlinePlayCircle />}
          label="Run Now"
          onClick={() => onRunNow(strategy.id)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <Button
          label={strategy.isActive ? 'Pause' : 'Activate'}
          onClick={() => onToggle(strategy.id)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <AppLink
          className="ml-auto text-xs tracking-[0.12em]"
          label="Open Detail"
          size={ButtonSize.SM}
          url={`/orchestration/${strategy.id}`}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </Card>
  );
}

function resolveCampaignLeadLabel(
  campaign: AgentCampaign,
  strategiesById: Map<string, AgentStrategy>,
): string {
  if (!campaign.campaignLeadStrategyId) {
    return 'Not assigned';
  }

  const strategy = strategiesById.get(campaign.campaignLeadStrategyId);
  return strategy?.label ?? strategy?.displayRole ?? 'Unknown lead';
}

function resolveApprovalPolicy(
  campaign: AgentCampaign,
  strategiesById: Map<string, AgentStrategy>,
): string {
  const linkedStrategies = campaign.agents
    .map((agentId) => strategiesById.get(agentId))
    .filter((strategy): strategy is AgentStrategy => Boolean(strategy));

  if (linkedStrategies.length === 0) {
    return 'Manual review';
  }

  return linkedStrategies.some(
    (strategy) => strategy.autonomyMode !== 'autopilot',
  )
    ? 'Manual review'
    : 'Autonomous publish';
}

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

  const { data: goals } = useResource(
    async (signal: AbortSignal) => {
      const service = await getGoalsService();
      const result = await service.list();
      return signal.aborted ? [] : result;
    },
    {
      defaultValue: [] as AgentGoal[],
    },
  );

  const { data: workflows } = useResource(
    async (signal: AbortSignal) => {
      const service = await getWorkflowsService();
      const result = await service.findAll();
      return signal.aborted ? [] : result;
    },
    {
      defaultValue: [] as Array<{ id: string }>,
    },
  );

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
        const current = groups[key] ?? [];
        return {
          ...groups,
          [key]: [...current, strategy],
        };
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
          <AppLink
            label={
              <>
                <HiPlus /> Hire Agent
              </>
            }
            size={ButtonSize.SM}
            url="/orchestration/hire"
            variant={ButtonVariant.SECONDARY}
          />
          <AppLink
            label={
              <>
                <HiOutlineRectangleGroup /> Launch Orchestrator
              </>
            }
            size={ButtonSize.SM}
            url="/orchestration/orchestrator"
            variant={ButtonVariant.DEFAULT}
          />
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
            <SummaryCard key={card.label} {...card} />
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
          <AppLink
            label="Hire Agent"
            size={ButtonSize.SM}
            url="/orchestration/hire"
            variant={ButtonVariant.SECONDARY}
          />
        </div>

        {isStrategiesLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[1, 2].map((index) => (
              <div
                key={index}
                className="h-56 animate-pulse rounded-[1.25rem] border border-white/[0.08] bg-white/[0.04]"
              />
            ))}
          </div>
        ) : strategies.length === 0 ? (
          <Card
            bodyClassName="flex flex-col items-start gap-4 p-6"
            description="Use the hire flow to spin up specialist agents for short-form, X, image, script, and avatar work."
            icon={HiOutlineUserGroup}
            iconWrapperClassName="bg-cyan-500/12 text-cyan-300"
            label="No team members yet"
          >
            <AppLink
              label="Hire Your First Agent"
              size={ButtonSize.SM}
              url="/orchestration/hire"
              variant={ButtonVariant.DEFAULT}
            />
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
                      <TeamMemberCard
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

      <section className="mt-10 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              Campaigns
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Orchestrator-level initiatives coordinating multiple specialists
              around one objective.
            </p>
          </div>
          <AppLink
            label="Launch Orchestrator"
            size={ButtonSize.SM}
            url="/orchestration/orchestrator"
            variant={ButtonVariant.SECONDARY}
          />
        </div>

        {isCampaignsLoading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[1, 2].map((index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-[1.25rem] border border-white/[0.08] bg-white/[0.04]"
              />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <Card
            bodyClassName="flex flex-col items-start gap-4 p-6"
            description="Create a main orchestrator campaign to coordinate goals, budgets, and active specialists."
            icon={HiOutlineRectangleGroup}
            iconWrapperClassName="bg-indigo-500/12 text-indigo-300"
            label="No orchestrators launched yet"
          >
            <AppLink
              label="Set Up Campaign Lead"
              size={ButtonSize.SM}
              url="/orchestration/orchestrator"
              variant={ButtonVariant.DEFAULT}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {campaigns.map((campaign) => (
              <Card
                key={campaign.id}
                bodyClassName="space-y-5 p-4"
                description={
                  campaign.brief ?? 'Coordinated multi-agent initiative.'
                }
                headerAction={
                  <span className="inline-flex rounded-full bg-blue-500/12 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                    {campaign.status}
                  </span>
                }
                label={campaign.label}
              >
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-foreground/45">Campaign Lead</p>
                    <p className="mt-1 font-medium text-foreground">
                      {resolveCampaignLeadLabel(campaign, strategiesById)}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground/45">Active Agents</p>
                    <p className="mt-1 font-medium text-foreground">
                      {campaign.agents.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground/45">Quota</p>
                    <p className="mt-1 font-medium text-foreground">
                      {campaign.contentQuota
                        ? `${campaign.contentQuota.posts ?? 0} posts / ${campaign.contentQuota.images ?? 0} images / ${campaign.contentQuota.videos ?? 0} videos`
                        : 'Open'}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground/45">Approval Policy</p>
                    <p className="mt-1 font-medium text-foreground">
                      {resolveApprovalPolicy(campaign, strategiesById)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-4">
                  <AppLink
                    label="Open Campaigns"
                    size={ButtonSize.SM}
                    url="/orchestration/campaigns"
                    variant={ButtonVariant.SECONDARY}
                  />
                  <AppLink
                    label="Adjust Orchestrator"
                    size={ButtonSize.SM}
                    url="/orchestration/orchestrator"
                    variant={ButtonVariant.SECONDARY}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

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
          <SummaryCard
            accent={`${workflows.length} workflow${workflows.length === 1 ? '' : 's'} available for repeatable content ops.`}
            href={href('/workflows')}
            label="Workflow Templates"
            tone="Fixed Graphs"
            value={String(workflows.length)}
          />
          <SummaryCard
            accent={`${strategies.filter((strategy) => strategy.isActive).length} active specialists are eligible for adaptive runs.`}
            href="/orchestration/autopilot"
            label="Adaptive Policies"
            tone="Autopilot"
            value={String(
              strategies.filter((strategy) => strategy.isActive).length,
            )}
          />
          <SummaryCard
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
