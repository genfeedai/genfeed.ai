import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
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
import { useCallback, useMemo } from 'react';

type SummaryCardProps = {
  accent: string;
  href?: string;
  label: string;
  tone: string;
  value: string;
};

export function useContentTeamPage() {
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
        href: APP_ROUTES.ORCHESTRATION.ORCHESTRATOR,
        label: 'Mission',
        tone: 'HQ',
        value: activeGoal?.label ?? 'No active goal',
      },
      {
        accent:
          reviewInbox.readyCount > 0
            ? `${reviewInbox.readyCount} ready and ${reviewInbox.pendingCount} still generating`
            : 'No reviews waiting right now.',
        href: APP_ROUTES.POSTS.REVIEW,
        label: 'Review Queue',
        tone: 'Approval',
        value: String(reviewInbox.readyCount + reviewInbox.pendingCount),
      },
      {
        accent:
          scheduledPostsPerWeek > 0
            ? `${scheduledPostsPerWeek} planned outputs across ${strategies.length} specialists`
            : 'No publishing cadence configured yet.',
        href: APP_ROUTES.ORCHESTRATION.AUTOPILOT,
        label: 'Calendar Pressure',
        tone: 'Cadence',
        value: `${scheduledPostsPerWeek}/week`,
      },
      {
        accent: `${stats?.completedToday ?? 0} completed, ${stats?.failedToday ?? 0} failed, ${activeRuns.length} active`,
        href: APP_ROUTES.ORCHESTRATION.RUNS,
        label: 'Run Health',
        tone: 'Operations',
        value: String(stats?.totalRuns ?? strategies.length),
      },
      {
        accent:
          dailyCreditBudget > 0
            ? `${creditsUsedToday} used today across ${dailyCreditBudget} planned credits`
            : 'No credit allocation configured yet.',
        href: APP_ROUTES.ORCHESTRATION.CAMPAIGNS,
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

  const automationCards = useMemo<SummaryCardProps[]>(
    () => [
      {
        accent: `${workflows.length} workflow${workflows.length === 1 ? '' : 's'} available for repeatable content ops.`,
        href: href('/workflows'),
        label: 'Workflow Templates',
        tone: 'Fixed Graphs',
        value: String(workflows.length),
      },
      {
        accent: `${strategies.filter((strategy) => strategy.isActive).length} active specialists are eligible for adaptive runs.`,
        href: APP_ROUTES.ORCHESTRATION.AUTOPILOT,
        label: 'Adaptive Policies',
        tone: 'Autopilot',
        value: String(
          strategies.filter((strategy) => strategy.isActive).length,
        ),
      },
      {
        accent:
          brandLabelsById.size > 0
            ? `${brandLabelsById.size} brand context${brandLabelsById.size === 1 ? '' : 's'} available for shared defaults.`
            : 'No brand context loaded.',
        href: APP_ROUTES.POSTS.REVIEW,
        label: 'Review Inbox',
        tone: 'Approvals',
        value: String(reviewInbox.readyCount),
      },
    ],
    [
      brandLabelsById.size,
      href,
      reviewInbox.readyCount,
      strategies,
      workflows.length,
    ],
  );

  return {
    strategies,
    isStrategiesLoading,
    campaigns,
    isCampaignsLoading,
    strategiesById,
    groupedStrategies,
    hqCards,
    automationCards,
    handleToggle,
    handleRunNow,
  };
}
