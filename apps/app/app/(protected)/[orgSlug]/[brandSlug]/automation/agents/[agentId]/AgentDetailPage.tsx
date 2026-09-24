'use client';

import { AgentActivityFeed } from '@genfeedai/agent/components/AgentActivityFeed';
import {
  AgentAutonomyMode,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
import Badge from '@ui/display/badge/Badge';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, CirclePlay, Clock, Cpu, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useMemo, useState } from 'react';
import AgentStrategyDialog from '../../autopilot/AgentStrategyDialog';
import { buildPayload } from '../../autopilot/build-agent-strategy-payload';
import AgentWorkflowRunDialog from '../AgentWorkflowRunDialog';
import { getAgentTypeIcon, getAgentTypeLabel } from '../agent-type-display';
import AgentOpportunityPanel from './AgentOpportunityPanel';
import AgentPerformanceSection from './AgentPerformanceSection';
import AgentWorkflowBindCard from './AgentWorkflowBindCard';
import AgentWorkSection from './AgentWorkSection';
import WorkflowExecutionHistorySection from './WorkflowExecutionHistorySection';

const AGENT_EXECUTION_PAGE_SIZE = 20;

function AgentDetailPageContent({ agentId }: AgentDetailPageProps) {
  const translate = useTranslations('common.automation.agentHub');
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

  const [expandedExecutionId, setExpandedExecutionId] = useState<string | null>(
    null,
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

  const handleToggleExpand = useCallback((executionId: string) => {
    setExpandedExecutionId((previous) =>
      previous === executionId ? null : executionId,
    );
  }, []);

  const Icon = getAgentTypeIcon(strategy?.agentType);
  const typeLabel = getAgentTypeLabel(strategy?.agentType);

  if (!isReady || isStrategyLoading) {
    return (
      <Container label="Agent Detail" icon={Cpu}>
        <div className="h-64 animate-pulse rounded bg-foreground/5" />
      </Container>
    );
  }

  if (isStrategyError) {
    return (
      <Container label="Agent Detail" icon={Cpu}>
        <p role="alert" className="text-destructive">
          Could not load this agent.
        </p>
      </Container>
    );
  }

  if (!strategy) {
    return (
      <Container label="Agent Detail" icon={Cpu}>
        <div className="py-16 text-center text-foreground/50">
          Agent not found.{' '}
          <Link href={href(APP_ROUTES.AUTOMATION.AGENTS)} className="underline">
            Back to Agent Hub
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
                <ArrowLeft /> Agents
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
          <Button
            label={strategy.isActive ? 'Deactivate' : 'Activate'}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            onClick={handleToggle}
          />
          <Button
            label={translate('schedule')}
            icon={<Clock />}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            onClick={() => setIsPolicyOpen(true)}
          />
          <Button
            label="Run workflow"
            icon={<Workflow />}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            onClick={handleOpenWorkflow}
          />
          <Button
            label={translate('runNow')}
            icon={<CirclePlay />}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            onClick={handleRunNow}
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
              {strategy.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH
                ? 'Auto-Publish'
                : 'Supervised'}
            </p>
          </div>
        </div>

        <AgentWorkflowBindCard
          agentId={agentId}
          strategy={strategy}
          onBound={refresh}
        />

        <KPISection
          title="Usage"
          gridCols={{ desktop: 4, mobile: 2, tablet: 4 }}
          items={[
            {
              description: `Budget: ${strategy.dailyCreditBudget}`,
              label: 'Credits Today',
              value: strategy.creditsUsedToday,
            },
            {
              description: `Budget: ${strategy.weeklyCreditBudget}`,
              label: 'Credits This Week',
              value: strategy.creditsUsedThisWeek,
            },
            {
              description: 'Latest runs for this agent',
              label: 'Recent executions',
              value: executions.length,
            },
            {
              description: 'Consecutive errors',
              label: 'Failures',
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

        <AgentWorkSection
          key={`posts-${collectionScope.organizationId}-${collectionScope.brandId}-${agentId}`}
          agentId={agentId}
        />
        <AgentPerformanceSection
          key={`performance-${collectionScope.organizationId}-${collectionScope.brandId}-${agentId}`}
          agentId={agentId}
        />
        <AgentActivityFeed
          runHistory={strategy.runHistory ?? []}
          getThreadHref={(threadId) =>
            href(`${APP_ROUTES.AGENT.ROOT}/${threadId}`)
          }
          getExecutionHref={(executionId) =>
            href(`${APP_ROUTES.AUTOMATION.RUNS}/${executionId}`)
          }
        />

        {isExecutionsError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load agent executions.
          </p>
        ) : (
          <WorkflowExecutionHistorySection
            executions={executions}
            expandedExecutionId={expandedExecutionId}
            isLoading={areExecutionsLoading}
            onToggleExpand={handleToggleExpand}
          />
        )}
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
