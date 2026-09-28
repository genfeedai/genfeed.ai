'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type {
  AgentHubActionsProps,
  AgentHubCardProps,
  AgentHubFactsProps,
  AgentHubRowProps,
  AgentHubStatusBadgeProps,
} from '@props/automation/agent-hub.props';
import type { CollectionOverflowAction } from '@props/ui/collection/collection.props';
import {
  AgentStrategiesService,
  type AgentStrategy,
  type AgentStrategyWorkflowBinding,
  type RunAgentStrategyWorkflowInput,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import { formatDistanceToNow } from 'date-fns';
import {
  CirclePause,
  CirclePlay,
  Play,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AddAgentDialog, { type AddAgentMode } from './AddAgentDialog';
import AgentWorkflowRunDialog from './AgentWorkflowRunDialog';
import { getAgentTypeIcon, getAgentTypeLabel } from './agent-type-display';

/** Per-viewer list/grid preference key for this collection. */
const AGENT_HUB_SURFACE = 'automation.agents';

/** Cadence for refreshing agent run state while the tab is in front. */
const AGENT_HUB_POLL_INTERVAL_MS = 30_000;

/** Your agents lists the most recently run healthy agents, not the whole team. */
const YOUR_AGENTS_LIMIT = 5;

const AGENT_HUB_SKELETON_COUNT = 3;

const FACT_SEPARATOR = ' · ';

/**
 * `consecutiveFailures` resets to 0 on every successful run, so any positive
 * count means the most recent run failed.
 */
function hasFailedLastRun(strategy: AgentStrategy): boolean {
  return strategy.consecutiveFailures > 0;
}

function isNeedingAttention(strategy: AgentStrategy): boolean {
  return !strategy.isActive || hasFailedLastRun(strategy);
}

function compareLastRunDescending(
  left: AgentStrategy,
  right: AgentStrategy,
): number {
  return (
    new Date(right.lastRunAt ?? 0).getTime() -
    new Date(left.lastRunAt ?? 0).getTime()
  );
}

function AgentHubFacts({ section, strategy }: AgentHubFactsProps) {
  const translate = useTranslations('common.automation.agentHub');
  const facts: string[] = [];

  if (section === 'all') {
    const typeLabel = getAgentTypeLabel(strategy.agentType);
    if (typeLabel) {
      facts.push(typeLabel);
    }
  }

  if (section === 'all' && strategy.brand) {
    facts.push(translate('card.brand', { brand: strategy.brand.label }));
  }

  if (strategy.lastRunAt) {
    facts.push(
      translate('card.lastRun', {
        time: formatDistanceToNow(new Date(strategy.lastRunAt), {
          addSuffix: true,
        }),
      }),
    );
  }

  if (section === 'all') {
    facts.push(
      translate('card.creditsToday', {
        budget: strategy.dailyCreditBudget,
        used: strategy.creditsUsedToday,
      }),
    );

    const workflow =
      strategy.preferredWorkflowTemplateId || strategy.preferredWorkflowId;
    if (workflow) {
      facts.push(translate('card.workflow', { workflow }));
    }
  }

  return <span className="min-w-0 truncate">{facts.join(FACT_SEPARATOR)}</span>;
}

/** Labels why an agent needs you; healthy agents carry no badge. */
function AgentHubStatusBadge({ strategy }: AgentHubStatusBadgeProps) {
  const translate = useTranslations('common.automation.agentHub');

  if (!isNeedingAttention(strategy)) {
    return null;
  }

  if (!strategy.isActive) {
    return (
      <Badge size={ComponentSize.SM} status="paused">
        {hasFailedLastRun(strategy)
          ? translate('status.pausedAfterFailures', {
              count: strategy.consecutiveFailures,
            })
          : translate('status.paused')}
      </Badge>
    );
  }

  return (
    <Badge size={ComponentSize.SM} status="failed">
      {translate('status.lastRunFailed')}
    </Badge>
  );
}

/** The status badge, when there is one, followed by the fact line. */
function AgentHubMeta({ section, strategy }: AgentHubFactsProps) {
  return (
    <>
      {section === 'yours' ? null : <AgentHubStatusBadge strategy={strategy} />}
      <AgentHubFacts section={section} strategy={strategy} />
    </>
  );
}

function AgentHubActions({
  onRunNow,
  onRunWorkflow,
  onToggle,
  primaryAction,
  strategy,
}: AgentHubActionsProps) {
  const translate = useTranslations('common.automation.agentHub');

  const runNowAction: CollectionOverflowAction = {
    icon: <CirclePlay className="size-4" />,
    id: 'run-now',
    label: translate('runNow'),
    onSelect: () => {
      void onRunNow(strategy.id);
    },
  };
  const runWorkflowAction: CollectionOverflowAction = {
    icon: <Workflow className="size-4" />,
    id: 'run-workflow',
    label: translate('runWorkflow'),
    onSelect: () => onRunWorkflow(strategy),
  };
  const toggleAction: CollectionOverflowAction = {
    icon: strategy.isActive ? (
      <CirclePause className="size-4" />
    ) : (
      <Play className="size-4" />
    ),
    id: 'toggle-active',
    label: strategy.isActive ? translate('pause') : translate('activate'),
    onSelect: () => {
      void onToggle(strategy.id, !strategy.isActive);
    },
  };

  const isActivatePrimary = primaryAction === 'activate';

  return (
    <CollectionItemActions
      overflow={
        isActivatePrimary
          ? [runNowAction, runWorkflowAction]
          : [runWorkflowAction, toggleAction]
      }
      primary={
        isActivatePrimary ? (
          <Button
            icon={<Play className="size-4" />}
            label={translate('activate')}
            onClick={() => onToggle(strategy.id, true)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        ) : (
          <Button
            icon={<CirclePlay className="size-4" />}
            label={translate('runNow')}
            onClick={() => onRunNow(strategy.id)}
            size={ButtonSize.SM}
            tooltip={translate('runNowTooltip')}
            variant={ButtonVariant.SECONDARY}
          />
        )
      }
    />
  );
}

function AgentHubRow({
  onRunNow,
  onRunWorkflow,
  onToggle,
  section,
  strategy,
}: AgentHubRowProps) {
  const { href } = useOrgUrl();
  const Icon = getAgentTypeIcon(strategy.agentType);

  return (
    <ListRow
      data-testid={`agent-row-${section}-${strategy.id}`}
      density={section === 'all' ? 'comfortable' : 'compact'}
      leading={
        <span className="flex size-8 shrink-0 items-center justify-center text-foreground/70">
          <Icon className="size-4" />
        </span>
      }
      meta={<AgentHubMeta section={section} strategy={strategy} />}
      title={
        <Link
          className="hover:underline"
          href={href(`${APP_ROUTES.AUTOMATION.AGENTS}/${strategy.id}`)}
        >
          {strategy.label}
        </Link>
      }
      trailing={
        <AgentHubActions
          onRunNow={onRunNow}
          onRunWorkflow={onRunWorkflow}
          onToggle={onToggle}
          primaryAction={
            section === 'needsYou' && !strategy.isActive ? 'activate' : 'runNow'
          }
          strategy={strategy}
        />
      }
    />
  );
}

function AgentHubCard({
  onRunNow,
  onRunWorkflow,
  onToggle,
  strategy,
}: AgentHubCardProps) {
  const { href } = useOrgUrl();

  return (
    <Card
      actions={
        <AgentHubActions
          onRunNow={onRunNow}
          onRunWorkflow={onRunWorkflow}
          onToggle={onToggle}
          primaryAction="runNow"
          strategy={strategy}
        />
      }
      data-testid={`agent-card-${strategy.id}`}
      icon={getAgentTypeIcon(strategy.agentType)}
      label={
        <Link
          className="hover:underline"
          href={href(`${APP_ROUTES.AUTOMATION.AGENTS}/${strategy.id}`)}
        >
          {strategy.label}
        </Link>
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <AgentHubMeta section="all" strategy={strategy} />
      </div>
    </Card>
  );
}

export default function AgentHubPage() {
  const translate = useTranslations('common.automation.agentHub');
  const collectionScope = useCollectionScope();
  const { brandId, isReady, organizationId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const { error, strategies, isLoading, refresh } = useAgentStrategies({
    ...toBrandListParams({ brandId }),
    enabled: isCollectionFetchReady({
      brandId,
      isReady,
      organizationId,
      pageScope,
    }),
  });
  const { setView, view } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: AGENT_HUB_SURFACE,
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

  const needsYouAgents = useMemo(
    () => strategies.filter(isNeedingAttention),
    [strategies],
  );

  const yourAgents = useMemo(
    () =>
      strategies
        .filter(
          (strategy) =>
            !isNeedingAttention(strategy) && Boolean(strategy.lastRunAt),
        )
        .sort(compareLastRunDescending)
        .slice(0, YOUR_AGENTS_LIMIT),
    [strategies],
  );

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

  const hasStrategies = strategies.length > 0;
  // A failed poll keeps showing the agents already loaded; only a failure
  // with nothing to show replaces the collection with the error.
  const hasLoadError = error !== null && !isLoading && !hasStrategies;
  const isEmpty = !isLoading && !hasLoadError && !hasStrategies;

  const actionHandlers = {
    onRunNow: handleRunNow,
    onRunWorkflow: handleOpenWorkflow,
    onToggle: handleToggle,
  };

  return (
    <Container
      label="Agents"
      description="Content agents that fill workflow prompts and assets, then run deterministic graphs."
      icon={Users}
      right={
        isEmpty ? undefined : (
          <Button
            icon={<UserPlus className="size-4" />}
            isDisabled={!isBrandReady || !brandId}
            label="Add agent"
            onClick={() => handleOpenAddAgent('library')}
            variant={ButtonVariant.DEFAULT}
          />
        )
      }
    >
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/30">
            <Users className="size-8" />
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
        <div className="flex flex-col gap-8">
          <CollectionSection
            data-testid="agent-hub-section-needs-you"
            isCountVisible
            itemCount={needsYouAgents.length}
            title={translate('sections.needsYou')}
          >
            <CollectionList>
              {needsYouAgents.map((strategy) => (
                <AgentHubRow
                  key={strategy.id}
                  section="needsYou"
                  strategy={strategy}
                  {...actionHandlers}
                />
              ))}
            </CollectionList>
          </CollectionSection>

          <CollectionSection
            data-testid="agent-hub-section-yours"
            itemCount={yourAgents.length}
            title={translate('sections.yours')}
          >
            <CollectionList>
              {yourAgents.map((strategy) => (
                <AgentHubRow
                  key={strategy.id}
                  section="yours"
                  strategy={strategy}
                  {...actionHandlers}
                />
              ))}
            </CollectionList>
          </CollectionSection>

          <CollectionSection
            actions={
              hasLoadError ? undefined : (
                <CollectionToolbar onViewChange={setView} view={view} />
              )
            }
            data-testid="agent-hub-section-all"
            error={
              hasLoadError ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{translate('loadError')}</span>
                  <Button
                    label={translate('retry')}
                    onClick={() => void refresh()}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  />
                </div>
              ) : undefined
            }
            isCountVisible
            isLoading={isLoading}
            itemCount={strategies.length}
            title={translate('sections.all')}
          >
            <CollectionView
              data-testid="agent-hub-collection"
              getItemKey={(strategy) => strategy.id}
              isLoading={isLoading}
              items={strategies}
              maxColumns={3}
              renderGridItem={(strategy) => (
                <AgentHubCard strategy={strategy} {...actionHandlers} />
              )}
              renderListItem={(strategy) => (
                <AgentHubRow
                  section="all"
                  strategy={strategy}
                  {...actionHandlers}
                />
              )}
              skeletonCount={AGENT_HUB_SKELETON_COUNT}
              view={view}
            />
          </CollectionSection>
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
