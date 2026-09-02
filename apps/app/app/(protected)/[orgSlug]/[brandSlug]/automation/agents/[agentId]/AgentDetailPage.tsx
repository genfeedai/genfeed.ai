'use client';

import {
  AgentAutonomyMode,
  AgentType,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  LinkedinIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategy } from '@hooks/data/agent-strategies/use-agent-strategy';
import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
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
import {
  ArrowLeft,
  CirclePlay,
  Cpu,
  FileText,
  Image,
  Megaphone,
  Sparkles,
  User,
  Video,
  Workflow,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import AgentWorkflowRunDialog from '../AgentWorkflowRunDialog';
import AgentOpportunityPanel from './AgentOpportunityPanel';
import AgentWorkflowBindCard from './AgentWorkflowBindCard';
import WorkflowExecutionHistorySection from './WorkflowExecutionHistorySection';

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  [AgentType.GENERAL]: 'General',
  [AgentType.X_CONTENT]: 'X Content',
  [AgentType.IMAGE_CREATOR]: 'Image Creator',
  [AgentType.VIDEO_CREATOR]: 'Video Creator',
  [AgentType.AI_AVATAR]: 'AI Avatar',
  [AgentType.ARTICLE_WRITER]: 'Article Writer',
  [AgentType.LINKEDIN_CONTENT]: 'LinkedIn Copywriter',
  [AgentType.ADS_SCRIPT_WRITER]: 'Ads Script Writer',
  [AgentType.SHORT_FORM_WRITER]: 'Short-Form Writer',
  [AgentType.CTA_CONTENT]: 'CTA / Conversion',
  [AgentType.YOUTUBE_SCRIPT]: 'YouTube Script',
  [AgentType.BRAND_INTERVIEW]: 'Brand Interview',
};

const AGENT_TYPE_ICONS: Record<AgentType, React.ReactNode> = {
  [AgentType.GENERAL]: <Cpu className="size-5" />,
  [AgentType.X_CONTENT]: <XTwitterIcon className="size-4" />,
  [AgentType.IMAGE_CREATOR]: <Image className="size-5" />,
  [AgentType.VIDEO_CREATOR]: <Video className="size-5" />,
  [AgentType.AI_AVATAR]: <User className="size-5" />,
  [AgentType.ARTICLE_WRITER]: <FileText className="size-5" />,
  [AgentType.LINKEDIN_CONTENT]: <LinkedinIcon className="size-4" />,
  [AgentType.ADS_SCRIPT_WRITER]: <Megaphone className="size-5" />,
  [AgentType.SHORT_FORM_WRITER]: <Zap className="size-5" />,
  [AgentType.CTA_CONTENT]: <Sparkles className="size-5" />,
  [AgentType.YOUTUBE_SCRIPT]: <YoutubeIcon className="size-4" />,
  [AgentType.BRAND_INTERVIEW]: <Sparkles className="size-5" />,
};

function AgentDetailPageContent({ agentId }: AgentDetailPageProps) {
  const notificationsService = NotificationsService.getInstance();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { href } = useOrgUrl();
  const requestedOpportunityId = searchParams.get('opportunity');
  const {
    strategy,
    isLoading: isStrategyLoading,
    refresh,
  } = useAgentStrategy(agentId);
  const { executions, isLoading: areExecutionsLoading } = useWorkflowExecutions(
    { limit: 100, sort: '-createdAt' },
  );

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );
  const { data: opportunities = [], isLoading: isOpportunitiesLoading } =
    useQuery<AgentStrategyOpportunity[]>({
      queryKey: ['agent-opportunities', agentId, requestedOpportunityId],
      queryFn: async () => {
        const service = await getService();
        return service.listOpportunities(agentId);
      },
      enabled: Boolean(requestedOpportunityId),
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
      notificationsService.success('Autopilot run triggered');
    } catch (error) {
      logger.error('Failed to trigger run', { error });
      notificationsService.error('Failed to trigger run');
    }
  }, [agentId, getService, notificationsService]);

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

  const strategyExecutions = useMemo(
    () =>
      executions.filter(
        (execution) => execution.metadata?.strategyId === agentId,
      ),
    [agentId, executions],
  );
  const recentExecutions = useMemo(
    () => strategyExecutions.slice(0, 20),
    [strategyExecutions],
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

  const agentType = strategy?.agentType as AgentType | undefined;
  const icon = agentType ? (
    (AGENT_TYPE_ICONS[agentType] ?? <Cpu className="size-5" />)
  ) : (
    <Cpu className="size-5" />
  );
  const typeLabel = agentType
    ? (AGENT_TYPE_LABELS[agentType] ?? strategy?.agentType)
    : '';

  if (isStrategyLoading) {
    return (
      <Container label="Agent Detail" icon={Cpu}>
        <div className="h-64 animate-pulse rounded bg-foreground/5" />
      </Container>
    );
  }

  if (!strategy) {
    return (
      <Container label="Agent Detail" icon={Cpu}>
        <div className="py-16 text-center text-foreground/50">
          Agent not found.{' '}
          <Link href={APP_ROUTES.AUTOMATION.AGENTS} className="underline">
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
        <Link href={APP_ROUTES.AUTOMATION.AGENTS}>
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
            label="Run workflow"
            icon={<Workflow />}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            onClick={handleOpenWorkflow}
          />
          <Button
            label="Autopilot"
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
            {icon}
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
              description: 'All time executions',
              label: 'Total Executions',
              value: strategyExecutions.length,
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

        <WorkflowExecutionHistorySection
          executions={recentExecutions}
          expandedExecutionId={expandedExecutionId}
          isLoading={areExecutionsLoading}
          onToggleExpand={handleToggleExpand}
        />
      </div>
    </Container>
  );
}

export default function AgentDetailPage(
  props: Parameters<typeof AgentDetailPageContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <AgentDetailPageContent {...props} />
    </Suspense>
  );
}
