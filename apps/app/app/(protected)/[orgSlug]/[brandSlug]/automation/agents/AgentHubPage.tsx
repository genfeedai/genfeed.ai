'use client';

import { AgentType, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  LinkedinIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import {
  isBrandResourceReady,
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import {
  AgentStrategiesService,
  type AgentStrategy,
  type AgentStrategyWorkflowBinding,
  type RunAgentStrategyWorkflowInput,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { formatDistanceToNow } from 'date-fns';
import {
  CirclePlay,
  Cpu,
  FileText,
  Image,
  Megaphone,
  Sparkles,
  User,
  UserPlus,
  Video,
  Workflow,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import AddAgentDialog, { type AddAgentMode } from './AddAgentDialog';
import AgentWorkflowRunDialog from './AgentWorkflowRunDialog';

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

function AgentCard({
  strategy,
  onToggle,
  onRunNow,
  onRunWorkflow,
}: {
  strategy: AgentStrategy;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
  onRunWorkflow: (strategy: AgentStrategy) => void;
}) {
  const translate = useTranslations('common.automation.agentHub');
  const agentType = strategy.agentType as AgentType;
  const icon = AGENT_TYPE_ICONS[agentType] ?? <Cpu className="size-5" />;
  const typeLabel = AGENT_TYPE_LABELS[agentType] ?? strategy.agentType;

  const lastRunLabel = strategy.lastRunAt
    ? formatDistanceToNow(new Date(strategy.lastRunAt), { addSuffix: true })
    : 'Never';

  const hasWorkflowBinding = Boolean(
    strategy.preferredWorkflowId || strategy.preferredWorkflowTemplateId,
  );

  return (
    <div className="rounded bg-secondary p-4 shadow-border flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded bg-foreground/5 text-foreground/70">
            {icon}
          </span>
          <div>
            <p className="font-medium text-sm">{strategy.label}</p>
            <p className="text-xs text-foreground/50 uppercase tracking-wide">
              {typeLabel}
            </p>
          </div>
        </div>
        <Badge status={strategy.isActive ? 'active' : 'planned'}>
          {strategy.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {strategy.brand && (
        <p className="text-xs text-foreground/50">
          {translate('card.brand', { brand: strategy.brand.label })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs text-foreground/60">
        <div>
          <span className="block text-foreground/40">
            {translate('card.lastRun')}
          </span>
          <span>{lastRunLabel}</span>
        </div>
        <div>
          <span className="block text-foreground/40">
            {translate('card.creditsToday')}
          </span>
          <span>
            {strategy.creditsUsedToday} / {strategy.dailyCreditBudget}
          </span>
        </div>
      </div>

      {hasWorkflowBinding ? (
        <p className="text-xs text-foreground/40">
          {translate('card.workflow', {
            workflow:
              strategy.preferredWorkflowTemplateId ||
              strategy.preferredWorkflowId ||
              '',
          })}
        </p>
      ) : (
        <p className="text-xs text-foreground/40">
          {translate('card.workflowDefault')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          label="Run workflow"
          icon={<Workflow className="size-4" />}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          onClick={() => onRunWorkflow(strategy)}
          tooltip="Fill topic/prompt/assets and run the bound workflow"
        />
        <Button
          label="Autopilot"
          icon={<CirclePlay className="size-4" />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => onRunNow(strategy.id)}
          tooltip="Queue proactive skill-based run"
        />
        <Button
          label={strategy.isActive ? 'Pause' : 'Activate'}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => onToggle(strategy.id, !strategy.isActive)}
        />
        <Link
          href={`${APP_ROUTES.AUTOMATION.AGENTS}/${strategy.id}`}
          className="ml-auto text-xs text-foreground/50 hover:text-foreground underline underline-offset-2"
        >
          {translate('card.viewDetail')}
        </Link>
      </div>
    </div>
  );
}

/** Cadence for refreshing agent run state while the tab is in front. */
const AGENT_HUB_POLL_INTERVAL_MS = 30_000;

export default function AgentHubPage() {
  const translate = useTranslations('common.automation.agentHub');
  const collectionScope = useCollectionScope();
  const { brandId, isReady, organizationId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const { strategies, isLoading, refresh } = useAgentStrategies({
    ...toBrandListParams({ brandId }),
    enabled: isCollectionFetchReady({
      brandId,
      isReady,
      organizationId,
      pageScope,
    }),
  });
  const notificationsService = NotificationsService.getInstance();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { href } = useOrgUrl();

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] =
    useState<AgentStrategy | null>(null);
  const [workflowBinding, setWorkflowBinding] =
    useState<AgentStrategyWorkflowBinding | null>(null);
  const [isLoadingBinding, setIsLoadingBinding] = useState(false);
  const [isSubmittingWorkflow, setIsSubmittingWorkflow] = useState(false);
  const addIntent = searchParams.get('add');
  const initialAddMode: AddAgentMode =
    addIntent === 'custom' ? 'custom' : 'library';
  const [addMode, setAddMode] = useState<AddAgentMode>(initialAddMode);
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(Boolean(addIntent));

  useEffect(() => {
    if (!addIntent) {
      return;
    }

    setAddMode(addIntent === 'custom' ? 'custom' : 'library');
    setIsAddAgentOpen(true);
  }, [addIntent]);

  useVisiblePolling(refresh, { intervalMs: AGENT_HUB_POLL_INTERVAL_MS });

  const handleToggle = useCallback(
    async (id: string, isActive: boolean) => {
      try {
        const service = await getService();
        await service.setActive(id, isActive);
        await refresh();
        notificationsService.success('Agent status updated');
      } catch (error) {
        logger.error('Failed to toggle agent', { error });
        notificationsService.error('Failed to update agent status');
      }
    },
    [getService, refresh, notificationsService],
  );

  const handleRunNow = useCallback(
    async (id: string) => {
      try {
        const service = await getService();
        await service.runNow(id);
        notificationsService.success('Agent run triggered');
      } catch (error) {
        logger.error('Failed to trigger agent run', { error });
        notificationsService.error('Failed to trigger run');
      }
    },
    [getService, notificationsService],
  );

  const handleOpenWorkflow = useCallback(
    async (strategy: AgentStrategy) => {
      setSelectedStrategy(strategy);
      setWorkflowDialogOpen(true);
      setWorkflowBinding(null);
      setIsLoadingBinding(true);
      try {
        const service = await getService();
        const binding = await service.getWorkflowBinding(strategy.id);
        setWorkflowBinding(binding);
      } catch (error) {
        logger.error('Failed to load workflow binding', { error });
        notificationsService.error('Could not load workflow binding');
      } finally {
        setIsLoadingBinding(false);
      }
    },
    [getService, notificationsService],
  );

  const handleSubmitWorkflow = useCallback(
    async (input: RunAgentStrategyWorkflowInput) => {
      if (!selectedStrategy) {
        return;
      }
      setIsSubmittingWorkflow(true);
      try {
        const service = await getService();
        const result = await service.runWorkflow(selectedStrategy.id, input);
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
        const message =
          error instanceof Error ? error.message : 'Failed to run workflow';
        notificationsService.error(message);
      } finally {
        setIsSubmittingWorkflow(false);
      }
    },
    [getService, href, notificationsService, refresh, router, selectedStrategy],
  );

  const handleOpenAddAgent = useCallback((mode: AddAgentMode) => {
    setAddMode(mode);
    setIsAddAgentOpen(true);
  }, []);

  const handleAgentCreated = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleAddAgentOpenChange = useCallback(
    (isOpen: boolean) => {
      setIsAddAgentOpen(isOpen);
      if (!isOpen && addIntent) {
        router.replace(pathname, { scroll: false });
      }
    },
    [addIntent, pathname, router],
  );

  return (
    <Container
      label="Agents"
      description="Content agents that fill workflow prompts and assets, then run deterministic graphs."
      icon={Cpu}
      right={
        <Button
          icon={<UserPlus className="size-4" />}
          isDisabled={!isBrandReady || !brandId}
          label="Add agent"
          onClick={() => handleOpenAddAgent('library')}
          variant={ButtonVariant.DEFAULT}
        />
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            'agent-hub-skeleton-1',
            'agent-hub-skeleton-2',
            'agent-hub-skeleton-3',
          ].map((skeletonId) => (
            <div
              key={skeletonId}
              className="h-44 animate-pulse rounded border border-foreground/10 bg-foreground/5"
            />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/30">
            <Cpu className="size-8" />
          </span>
          <div>
            <p className="text-lg font-medium">{translate('empty.title')}</p>
            <p className="mt-1 text-sm text-foreground/50">
              {translate('empty.description')}
            </p>
          </div>
          <Button
            label="Add your first agent"
            variant={ButtonVariant.DEFAULT}
            icon={<UserPlus className="size-4" />}
            isDisabled={!isBrandReady || !brandId}
            onClick={() => handleOpenAddAgent('library')}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {strategies.map((strategy) => (
            <AgentCard
              key={strategy.id}
              strategy={strategy}
              onToggle={handleToggle}
              onRunNow={handleRunNow}
              onRunWorkflow={handleOpenWorkflow}
            />
          ))}
        </div>
      )}

      <AgentWorkflowRunDialog
        strategy={selectedStrategy}
        binding={workflowBinding}
        isLoadingBinding={isLoadingBinding}
        isOpen={workflowDialogOpen}
        isSubmitting={isSubmittingWorkflow}
        onOpenChange={setWorkflowDialogOpen}
        onSubmit={handleSubmitWorkflow}
      />

      <AddAgentDialog
        initialMode={addMode}
        isOpen={isAddAgentOpen}
        onCreated={handleAgentCreated}
        onOpenChange={handleAddAgentOpenChange}
      />
    </Container>
  );
}
