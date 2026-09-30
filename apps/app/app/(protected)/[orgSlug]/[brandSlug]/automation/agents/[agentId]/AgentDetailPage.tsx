'use client';

import {
  AgentAutonomyMode,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import { isPostAwaitingReview } from '@helpers/content/post-review.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import type { AgentDetailPageProps } from '@props/automation/agent-strategy.props';
import type {
  AgentStrategyWorkflowBinding,
  RunAgentStrategyWorkflowInput,
} from '@services/automation/agent-strategies.service';
import {
  AgentStrategiesService,
  type AgentStrategyOpportunity,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import Badge from '@ui/display/badge/Badge';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import RecordFactLine from '@ui/record-detail/RecordFactLine';
import { ArrowLeft, CirclePlay, Clock, Cpu, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useMemo, useState } from 'react';
import AgentStrategyDialog from '../../autopilot/AgentStrategyDialog';
import { buildPayload } from '../../autopilot/build-agent-strategy-payload';
import AgentWorkflowRunDialog from '../AgentWorkflowRunDialog';
import { getAgentTypeIcon, getAgentTypeLabel } from '../agent-type-display';
import AgentActivitySection from './AgentActivitySection';
import AgentDetailNeedsYou from './AgentDetailNeedsYou';
import AgentOpportunityPanel from './AgentOpportunityPanel';
import AgentWorkflowBindCard from './AgentWorkflowBindCard';
import { buildAgentDetailFacts } from './agent-detail-facts.helper';
import { useAgentDetailPosts } from './use-agent-detail-posts';

const AGENT_EXECUTION_PAGE_SIZE = 20;

function AgentDetailPageContent({ agentId }: AgentDetailPageProps) {
  const translate = useTranslations('common.automation.agentHub');
  const detail = useTranslations('common.automation.agentDetail');
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { href } = useOrgUrl();
  const collectionScope = useCollectionScope();
  const isReady = isCollectionFetchReady(collectionScope);
  const brandParams = toBrandListParams(collectionScope);
  const requestedOpportunityId = searchParams.get('opportunity');
  const {
    executions,
    isLoading: areExecutionsLoading,
    isError: isExecutionsError,
    refresh: refreshExecutions,
  } = useWorkflowExecutions(
    {
      ...brandParams,
      limit: AGENT_EXECUTION_PAGE_SIZE,
      sort: '-createdAt',
      strategyId: agentId,
    },
    { enabled: isReady, organizationId: collectionScope.organizationId },
  );

  // Same query key as `AgentWorkSection`'s Content filter, so react-query
  // serves the pending-review count from the same cache entry instead of a
  // second request (#5483).
  const { posts: agentPosts } = useAgentDetailPosts(agentId);
  const pendingReviewCount = useMemo(
    () => agentPosts.filter(isPostAwaitingReview).length,
    [agentPosts],
  );

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const {
    data: strategy,
    isLoading: isStrategyLoading,
    isError: isStrategyError,
    refetch,
  } = useQuery({
    queryKey: [
      'agent-strategy',
      collectionScope.organizationId,
      collectionScope.brandId,
      agentId,
    ],
    enabled: isReady && Boolean(agentId),
    queryFn: async () => {
      const agent = await (await getService()).getById(agentId);
      return collectionScope.brandId &&
        (agent.brandId ?? agent.brand?.id) !== collectionScope.brandId
        ? null
        : agent;
    },
  });
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);
  useVisiblePolling(
    () => {
      void refresh();
      void refreshExecutions();
    },
    { intervalMs: 30_000, isEnabled: isReady },
  );
  const { data: opportunities = [], isLoading: isOpportunitiesLoading } =
    useQuery<AgentStrategyOpportunity[]>({
      queryKey: [
        'agent-opportunities',
        collectionScope.organizationId,
        collectionScope.brandId,
        agentId,
        requestedOpportunityId,
      ],
      queryFn: async () => {
        const service = await getService();
        return service.listOpportunities(agentId);
      },
      enabled: isReady && Boolean(strategy) && Boolean(requestedOpportunityId),
    });

  const handleToggle = useCallback(async () => {
    if (!strategy) return;
    try {
      const service = await getService();
      await service.setActive(agentId, !strategy.isActive);
      await refresh();
      notificationsService.success('Agent status updated');
    } catch (error) {
      logger.error('Failed to toggle agent', { error });
      notificationsService.error('Failed to update agent status');
    }
  }, [agentId, getService, notificationsService, refresh, strategy]);

  const handleRunNow = useCallback(async () => {
    try {
      const service = await getService();
      await service.runNow(agentId);
      notificationsService.success('Agent run triggered');
      await Promise.all([refresh(), refreshExecutions()]);
    } catch (error) {
      logger.error('Failed to trigger run', { error });
      notificationsService.error('Failed to trigger run');
    }
  }, [agentId, getService, notificationsService, refresh, refreshExecutions]);

  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const handlePolicySubmit = useCallback(
    async (form: AgentStrategyFormState) => {
      setIsSavingPolicy(true);
      try {
        const service = await getService();
        await service.update(agentId, buildPayload(form));
        notificationsService.success('Agent schedule updated');
        setIsPolicyOpen(false);
        await refresh();
      } catch (error) {
        logger.error('Failed to save agent schedule', { error });
        notificationsService.error('Failed to save agent schedule');
      } finally {
        setIsSavingPolicy(false);
      }
    },
    [agentId, getService, notificationsService, refresh],
  );

  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [workflowBinding, setWorkflowBinding] =
    useState<AgentStrategyWorkflowBinding | null>(null);
  const [isLoadingBinding, setIsLoadingBinding] = useState(false);
  const [isSubmittingWorkflow, setIsSubmittingWorkflow] = useState(false);

  const handleOpenWorkflow = useCallback(async () => {
    setWorkflowDialogOpen(true);
    setWorkflowBinding(null);
    setIsLoadingBinding(true);
    try {
      const service = await getService();
      const binding = await service.getWorkflowBinding(agentId);
      setWorkflowBinding(binding);
    } catch (error) {
      logger.error('Failed to load workflow binding', { error });
      notificationsService.error('Could not load workflow binding');
    } finally {
      setIsLoadingBinding(false);
    }
  }, [agentId, getService, notificationsService]);

  const handleSubmitWorkflow = useCallback(
    async (input: RunAgentStrategyWorkflowInput) => {
      setIsSubmittingWorkflow(true);
      try {
        const service = await getService();
        const result = await service.runWorkflow(agentId, input);
        const executionPath = href(
          `${APP_ROUTES.AUTOMATION.RUNS}/${result.executionId}`,
        );
        notificationsService.success(
          `Workflow started (${result.status}). Opening execution…`,
        );
        setWorkflowDialogOpen(false);
        await refresh();
        router.push(executionPath);
      } catch (error) {
        logger.error('Failed to run agent workflow', { error });
        notificationsService.error(
          error instanceof Error ? error.message : 'Failed to run workflow',
        );
      } finally {
        setIsSubmittingWorkflow(false);
      }
    },
    [agentId, getService, href, notificationsService, refresh, router],
  );

  const selectedOpportunity = useMemo(
    () =>
      requestedOpportunityId
        ? ((opportunities ?? []).find(
            (opportunity) => opportunity.id === requestedOpportunityId,
          ) ?? null)
        : null,
    [opportunities, requestedOpportunityId],
  );

  const Icon = getAgentTypeIcon(strategy?.agentType);
  const typeLabel = getAgentTypeLabel(strategy?.agentType);
  const autonomyLabel =
    strategy?.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH
      ? 'Auto-Publish'
      : 'Supervised';

  // Run now is the one action every agent record supports regardless of
  // state; everything else — status toggle, schedule, manual workflow run —
  // moves into the overflow menu.
  const overflow = useMemo<CollectionOverflowAction[]>(() => {
    if (!strategy) {
      return [];
    }
    return [
      {
        icon: <Workflow className="size-4" />,
        id: 'run-workflow',
        label: detail('runWorkflow'),
        onSelect: handleOpenWorkflow,
      },
      {
        icon: <Clock className="size-4" />,
        id: 'schedule',
        label: translate('schedule'),
        onSelect: () => setIsPolicyOpen(true),
      },
      {
        id: 'toggle-active',
        label: strategy.isActive ? detail('deactivate') : detail('activate'),
        onSelect: handleToggle,
      },
    ];
  }, [detail, handleOpenWorkflow, handleToggle, strategy, translate]);

  if (!isReady || isStrategyLoading) {
    return (
      <Container label={detail('title')} icon={Cpu}>
        <div className="h-64 animate-pulse rounded bg-foreground/5" />
      </Container>
    );
  }

  if (isStrategyError) {
    return (
      <Container label={detail('title')} icon={Cpu}>
        <p role="alert" className="text-destructive">
          {detail('loadError')}
        </p>
      </Container>
    );
  }

  if (!strategy) {
    return (
      <Container label={detail('title')} icon={Cpu}>
        <div className="py-16 text-center text-foreground/50">
          {detail('notFound')}{' '}
          <Link href={href(APP_ROUTES.AUTOMATION.AGENTS)} className="underline">
            {detail('backToHub')}
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container
      label={strategy.label}
      description={`${typeLabel} agent`}
      icon={Cpu}
      left={
        <Link href={href(APP_ROUTES.AUTOMATION.AGENTS)}>
          <Button
            label={
              <>
                <ArrowLeft /> {detail('agents')}
              </>
            }
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        </Link>
      }
      right={
        <div className="flex items-center gap-2">
          <Badge variant={strategy.isActive ? 'success' : 'secondary'}>
            {strategy.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <CollectionItemActions
            overflow={overflow}
            primary={
              <Button
                icon={<CirclePlay />}
                label={translate('runNow')}
                onClick={handleRunNow}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              />
            }
          />
        </div>
      }
    >
      <div className="space-y-6">
        {/* Agent info header */}
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded bg-foreground/5 text-foreground/70">
            <Icon className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{strategy.label}</p>
            <p className="text-sm text-foreground/50">
              {typeLabel}
              {strategy.brand ? ` · ${strategy.brand.label}` : ''}
              {' · '}
              {autonomyLabel}
            </p>
          </div>
        </div>

        <RecordFactLine
          facts={buildAgentDetailFacts(strategy, typeLabel, autonomyLabel, {
            autonomy: detail('factAutonomy'),
            brand: detail('factBrand'),
            creditsToday: detail('factCreditsToday'),
            lastRun: detail('factLastRun'),
            nextRun: detail('factNextRun'),
            type: detail('factType'),
          })}
        />

        <AgentDetailNeedsYou
          failureCount={strategy.consecutiveFailures}
          failuresDescription={detail('needsYouFailures', {
            count: strategy.consecutiveFailures,
          })}
          pendingReviewCount={pendingReviewCount}
          pendingReviewDescription={detail('needsYouPendingReview', {
            count: pendingReviewCount,
          })}
          reviewHref={href(APP_ROUTES.PUBLISHING.REVIEW)}
          reviewLabel={detail('reviewContent')}
          runsHref={href(APP_ROUTES.AUTOMATION.RUNS)}
          title={detail('needsYouTitle')}
          viewRunsLabel={detail('viewRuns')}
        />

        <AgentWorkflowBindCard
          agentId={agentId}
          strategy={strategy}
          onBound={refresh}
        />

        <KPISection
          title={detail('usage')}
          gridCols={{ desktop: 4, mobile: 2 }}
          items={[
            {
              description: detail('budget', {
                amount: strategy.dailyCreditBudget,
              }),
              label: detail('creditsToday'),
              value: strategy.creditsUsedToday,
            },
            {
              description: detail('budget', {
                amount: strategy.weeklyCreditBudget,
              }),
              label: detail('creditsThisWeek'),
              value: strategy.creditsUsedThisWeek,
            },
            {
              description: detail('recentRunsDescription'),
              label: detail('recentExecutions'),
              value: executions.length,
            },
            {
              description: detail('consecutiveErrors'),
              label: detail('failures'),
              value: strategy.consecutiveFailures,
              valueClassName:
                strategy.consecutiveFailures > 0
                  ? 'text-destructive'
                  : 'text-success',
            },
          ]}
        />

        <AgentStrategyDialog
          initialStrategy={strategy}
          isOpen={isPolicyOpen}
          isSubmitting={isSavingPolicy}
          onOpenChange={setIsPolicyOpen}
          onSubmit={handlePolicySubmit}
        />

        <AgentWorkflowRunDialog
          strategy={strategy}
          binding={workflowBinding}
          isLoadingBinding={isLoadingBinding}
          isOpen={workflowDialogOpen}
          isSubmitting={isSubmittingWorkflow}
          onOpenChange={setWorkflowDialogOpen}
          onSubmit={handleSubmitWorkflow}
        />

        {requestedOpportunityId && (
          <AgentOpportunityPanel
            requestedOpportunityId={requestedOpportunityId}
            selectedOpportunity={selectedOpportunity}
            isOpportunitiesLoading={isOpportunitiesLoading}
          />
        )}

        <AgentActivitySection
          agentId={agentId}
          executions={executions}
          isExecutionsError={isExecutionsError}
          isExecutionsLoading={areExecutionsLoading}
          key={`activity-${collectionScope.organizationId}-${collectionScope.brandId}-${agentId}`}
          runHistory={strategy.runHistory ?? []}
        />
      </div>
    </Container>
  );
}

export default function AgentDetailPage(
  props: Parameters<typeof AgentDetailPageContent>[0],
) {
  const scope = useCollectionScope();
  return (
    <Suspense fallback={null}>
      <AgentDetailPageContent
        key={`${scope.organizationId}-${scope.brandId}-${props.agentId}`}
        {...props}
      />
    </Suspense>
  );
}
