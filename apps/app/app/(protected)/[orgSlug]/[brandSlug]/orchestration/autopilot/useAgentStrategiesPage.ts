import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import {
  AgentStrategiesService,
  type AgentStrategy,
  type CreateAgentStrategyInput,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

type AgentStrategyPayload = CreateAgentStrategyInput & {
  isEnabled: boolean;
};

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

export function useAgentStrategiesPage() {
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

  const handleRowClick = useCallback(
    (strategy: AgentStrategy) => {
      push(`/orchestration/${strategy.id}`);
    },
    [push],
  );

  return {
    handleDialogChange,
    handleRowClick,
    handleRunNow,
    handleSubmit,
    handleToggle,
    href,
    isDialogOpen,
    isLoading,
    isSubmitting,
    openCreateDialog,
    openEditDialog,
    selectedStrategy,
    strategies,
  };
}
