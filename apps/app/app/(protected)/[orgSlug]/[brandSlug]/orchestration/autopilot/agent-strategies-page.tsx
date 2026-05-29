'use client';

import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  ButtonVariant,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  AgentStrategiesService,
  type AgentStrategy,
  type CreateAgentStrategyInput,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiOutlineBolt,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineMegaphone,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSparkles,
  HiOutlineUser,
  HiOutlineVideoCamera,
  HiPlus,
} from 'react-icons/hi2';
import AgentStrategiesEmptyState from './AgentStrategiesEmptyState';
import AgentStrategiesInfoBanner from './AgentStrategiesInfoBanner';
import AgentStrategyDialog from './AgentStrategyDialog';

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
};

const AGENT_TYPE_ICONS: Record<AgentType, React.ReactNode> = {
  [AgentType.GENERAL]: <HiOutlineCpuChip className="size-4" />,
  [AgentType.X_CONTENT]: <FaXTwitter className="size-4" />,
  [AgentType.IMAGE_CREATOR]: <HiOutlinePhoto className="size-4" />,
  [AgentType.VIDEO_CREATOR]: <HiOutlineVideoCamera className="size-4" />,
  [AgentType.AI_AVATAR]: <HiOutlineUser className="size-4" />,
  [AgentType.ARTICLE_WRITER]: <HiOutlineDocumentText className="size-4" />,
  [AgentType.LINKEDIN_CONTENT]: <FaLinkedin className="size-4" />,
  [AgentType.ADS_SCRIPT_WRITER]: <HiOutlineMegaphone className="size-4" />,
  [AgentType.SHORT_FORM_WRITER]: <HiOutlineBolt className="size-4" />,
  [AgentType.CTA_CONTENT]: <HiOutlineSparkles className="size-4" />,
  [AgentType.YOUTUBE_SCRIPT]: <FaYoutube className="size-4" />,
};

const AUTONOMY_MODE_LABELS: Record<AgentAutonomyMode, string> = {
  [AgentAutonomyMode.SUPERVISED]: 'Supervised',
  [AgentAutonomyMode.AUTO_PUBLISH]: 'Autopilot',
};

const RUN_FREQUENCY_LABELS: Record<AgentRunFrequency, string> = {
  [AgentRunFrequency.DAILY]: 'Daily',
  [AgentRunFrequency.TWICE_DAILY]: 'Twice daily',
  [AgentRunFrequency.EVERY_6_HOURS]: 'Every 6 hours',
};

type AgentStrategyPayload = CreateAgentStrategyInput & {
  isEnabled: boolean;
};

function formatRelativeDate(dateStr?: string): string {
  if (!dateStr) {
    return 'Never';
  }

  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

function buildPayload(form: AgentStrategyFormState): AgentStrategyPayload {
  return {
    agentType: form.agentType,
    autonomyMode: form.autonomyMode,
    autoPublishConfidenceThreshold:
      Number(form.autoPublishConfidenceThreshold) || 0,
    budgetPolicy: {
      monthlyCreditBudget: Number(form.monthlyCreditBudget) || 0,
      reserveTrendBudget: Number(form.reserveTrendBudget) || 0,
    },
    dailyCreditBudget: Number(form.dailyCreditBudget) || 0,
    goalProfile: form.goalProfile,
    isActive: form.isActive,
    isEnabled: form.isEnabled,
    label: form.label.trim(),
    minCreditThreshold: Number(form.minCreditThreshold) || 0,
    opportunitySources: {
      eventTriggersEnabled: form.eventTriggersEnabled,
      evergreenCadenceEnabled: form.evergreenCadenceEnabled,
      trendWatchersEnabled: form.trendWatchersEnabled,
    },
    platforms: form.platforms,
    skillSlugs: form.skillSlugs,
    publishPolicy: {
      autoPublishEnabled: form.autoPublishEnabled,
      minImageScore: Number(form.minImageScore) || 0,
      minPostScore: Number(form.minPostScore) || 0,
    },
    reportingPolicy: {
      dailyDigestEnabled: form.dailyDigestEnabled,
      weeklySummaryEnabled: form.weeklySummaryEnabled,
    },
    runFrequency: form.runFrequency,
    topics: form.topics.split(',').flatMap((topic) => {
      const trimmedTopic = topic.trim();
      return trimmedTopic ? [trimmedTopic] : [];
    }),
  };
}

export default function AgentStrategiesPage() {
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const { strategies, isLoading, refresh } = useAgentStrategies();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStrategy, setSelectedStrategy] =
    useState<AgentStrategy | null>(null);

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const openCreateDialog = useCallback(() => {
    setSelectedStrategy(null);
    setIsDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((strategy: AgentStrategy) => {
    setSelectedStrategy(strategy);
    setIsDialogOpen(true);
  }, []);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    setIsDialogOpen(isOpen);
    if (!isOpen) {
      setSelectedStrategy(null);
    }
  }, []);

  const handleSubmit = useCallback(
    async (form: AgentStrategyFormState) => {
      if (!form.label.trim()) {
        notificationsService.error('Strategy label is required');
        return;
      }

      if (form.platforms.length === 0) {
        notificationsService.error('Select at least one platform');
        return;
      }

      setIsSubmitting(true);

      try {
        const service = await getService();
        const payload = buildPayload(form);

        if (selectedStrategy) {
          await service.update(selectedStrategy.id, payload);
          notificationsService.success('Strategy updated');
        } else {
          await service.create(payload);
          notificationsService.success('Strategy created');
        }

        handleDialogChange(false);
        await refresh();
      } catch (error) {
        logger.error('Failed to save strategy', { error });
        notificationsService.error('Failed to save strategy');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      getService,
      handleDialogChange,
      notificationsService,
      refresh,
      selectedStrategy,
    ],
  );

  const handleToggle = useCallback(
    async (strategy: AgentStrategy) => {
      try {
        const service = await getService();
        await service.toggle(strategy.id);
        notificationsService.success(
          strategy.isActive ? 'Strategy paused' : 'Strategy activated',
        );
        await refresh();
      } catch (error) {
        logger.error('Failed to toggle strategy', { error });
        notificationsService.error('Failed to update strategy');
      }
    },
    [getService, notificationsService, refresh],
  );

  const handleRunNow = useCallback(
    async (strategy: AgentStrategy) => {
      try {
        const service = await getService();
        await service.runNow(strategy.id);
        notificationsService.success('Strategy run triggered');
        await refresh();
      } catch (error) {
        logger.error('Failed to run strategy', { error });
        notificationsService.error('Failed to trigger strategy run');
      }
    },
    [getService, notificationsService, refresh],
  );

  const columns = useMemo<TableColumn<AgentStrategy>[]>(
    () => [
      {
        header: 'Strategy',
        key: 'label',
        render: (strategy) => {
          const icon =
            AGENT_TYPE_ICONS[strategy.agentType as AgentType] ??
            AGENT_TYPE_ICONS[AgentType.GENERAL];

          return (
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded bg-white/5 text-white/70">
                {icon}
              </span>
              <div className="flex flex-col">
                <span className="font-medium">{strategy.label}</span>
                <span className="text-xs text-foreground/50">
                  {strategy.topics.length > 0
                    ? strategy.topics.join(', ')
                    : 'No topics configured'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        header: 'Type',
        key: 'agentType',
        render: (strategy) => (
          <span className="text-sm">
            {AGENT_TYPE_LABELS[strategy.agentType as AgentType] ??
              strategy.agentType}
          </span>
        ),
      },
      {
        header: 'Autonomy',
        key: 'autonomyMode',
        render: (strategy) => (
          <Badge
            variant={
              strategy.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH
                ? 'success'
                : 'secondary'
            }
          >
            {AUTONOMY_MODE_LABELS[strategy.autonomyMode as AgentAutonomyMode]}
          </Badge>
        ),
      },
      {
        header: 'Platforms',
        key: 'platforms',
        render: (strategy) => (
          <span className="text-sm">
            {strategy.platforms.length > 0
              ? strategy.platforms.join(', ')
              : '—'}
          </span>
        ),
      },
      {
        header: 'Skills',
        key: 'skillSlugs',
        render: (strategy) => (
          <span className="text-sm">
            {strategy.skillSlugs.length > 0
              ? strategy.skillSlugs.join(', ')
              : '—'}
          </span>
        ),
      },
      {
        header: 'Schedule',
        key: 'runFrequency',
        render: (strategy) => (
          <div className="flex flex-col text-sm">
            <span>
              {RUN_FREQUENCY_LABELS[strategy.runFrequency as AgentRunFrequency]}
            </span>
            <span className="text-xs text-foreground/50">
              {strategy.timezone || 'UTC'}
            </span>
          </div>
        ),
      },
      {
        header: 'Budget',
        key: 'dailyCreditBudget',
        render: (strategy) => (
          <div className="flex flex-col text-sm">
            <span>{strategy.dailyCreditBudget} daily</span>
            <span className="text-xs text-foreground/50">
              {strategy.creditsUsedToday} used today
            </span>
          </div>
        ),
      },
      {
        header: 'Last Run',
        key: 'lastRunAt',
        render: (strategy) => (
          <span className="text-sm">
            {formatRelativeDate(strategy.lastRunAt)}
          </span>
        ),
      },
      {
        header: 'Status',
        key: 'isActive',
        render: (strategy) => (
          <div className="flex flex-col gap-1">
            <Badge variant={strategy.isActive ? 'success' : 'secondary'}>
              {strategy.isActive ? 'Active' : 'Paused'}
            </Badge>
            {!strategy.isEnabled && (
              <span className="text-xs text-foreground/50">Disabled</span>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      {
        icon: <HiOutlinePencilSquare />,
        onClick: (strategy: AgentStrategy) => openEditDialog(strategy),
        tooltip: 'Edit strategy',
      },
      {
        icon: <HiOutlinePlayCircle />,
        isDisabled: (strategy: AgentStrategy) =>
          !strategy.isActive || !strategy.isEnabled,
        onClick: (strategy: AgentStrategy) => {
          void handleRunNow(strategy);
        },
        tooltip: 'Run now',
      },
      {
        icon: (strategy: AgentStrategy) => (
          <span className="text-xs font-semibold">
            {strategy.isActive ? 'Pause' : 'Start'}
          </span>
        ),
        onClick: (strategy: AgentStrategy) => {
          void handleToggle(strategy);
        },
        tooltip: (strategy: AgentStrategy) =>
          strategy.isActive ? 'Pause strategy' : 'Activate strategy',
      },
    ],
    [handleRunNow, handleToggle, openEditDialog],
  );

  return (
    <>
      <Container
        label="Autopilot"
        description="Use autopilot policies to schedule adaptive agent runs."
        icon={HiOutlineCpuChip}
        right={
          <Button
            label={
              <>
                <HiPlus /> Add Autopilot
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={openCreateDialog}
          />
        }
      >
        <AgentStrategiesInfoBanner workflowsHref={href('/workflows')} />
        <AppTable<AgentStrategy>
          items={strategies}
          columns={columns}
          actions={actions}
          isLoading={isLoading}
          getRowKey={(strategy) => strategy.id}
          onRowClick={(strategy) => push(`/orchestration/${strategy.id}`)}
          emptyState={
            <AgentStrategiesEmptyState onAddClick={openCreateDialog} />
          }
        />
      </Container>

      <AgentStrategyDialog
        initialStrategy={selectedStrategy}
        isOpen={isDialogOpen}
        isSubmitting={isSubmitting}
        onOpenChange={handleDialogChange}
        onSubmit={handleSubmit}
      />
    </>
  );
}
