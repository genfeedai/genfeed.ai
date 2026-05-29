import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import {
  buildBlueprintStrategyInputs,
  buildContentTeamCampaignInput,
  buildContentTeamGoalInput,
  CONTENT_TEAM_BLUEPRINT_PRESETS,
  CONTENT_TEAM_ROLE_PRESETS,
} from '@pages/agents/content-team/content-team-presets';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { AgentGoalsService } from '@services/automation/agent-goals.service';
import {
  AgentStrategiesService,
  type AgentStrategy,
} from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

interface OrchestratorFormState {
  blueprintId: string;
  brandId: string;
  campaignBrief: string;
  campaignLabel: string;
  creditsAllocated: string;
  goalDescription: string;
  goalLabel: string;
  goalMetric: 'engagement_rate' | 'posts' | 'views';
  goalTargetValue: string;
  leadSelection: string;
  persona: string;
  reportsToLabel: string;
  selectedStrategyIds: string[];
  sharedTopic: string;
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function useContentTeamOrchestratorPage() {
  const { push } = useRouter();
  const notificationsService = NotificationsService.getInstance();
  const { brandId, brands } = useBrand();
  const { strategies } = useAgentStrategies();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<OrchestratorFormState>({
    blueprintId: CONTENT_TEAM_BLUEPRINT_PRESETS[0]?.id ?? '',
    brandId,
    campaignBrief: '',
    campaignLabel: '',
    creditsAllocated: '0',
    goalDescription: '',
    goalLabel: '',
    goalMetric: 'views',
    goalTargetValue: '',
    leadSelection: '',
    persona: '',
    reportsToLabel: 'Main Orchestrator',
    selectedStrategyIds: [],
    sharedTopic: '',
  });

  const getCampaignsService = useAuthedService((token: string) =>
    AgentCampaignsService.getInstance(token),
  );
  const getGoalsService = useAuthedService((token: string) =>
    AgentGoalsService.getInstance(token),
  );
  const getStrategiesService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const selectedBlueprint = useMemo(
    () =>
      CONTENT_TEAM_BLUEPRINT_PRESETS.find(
        (preset) => preset.id === form.blueprintId,
      ) ?? CONTENT_TEAM_BLUEPRINT_PRESETS[0],
    [form.blueprintId],
  );

  const blueprintRoles = useMemo(
    () =>
      CONTENT_TEAM_ROLE_PRESETS.filter((preset) =>
        selectedBlueprint?.roleIds.includes(preset.id),
      ),
    [selectedBlueprint],
  );

  const leadOptions = useMemo(() => {
    const existing = strategies.map((strategy) => ({
      label: `${strategy.label} (existing)`,
      value: `existing:${strategy.id}`,
    }));

    const blueprint = blueprintRoles.map((role) => ({
      label: `${role.displayRole} (blueprint)`,
      value: `blueprint:${role.id}`,
    }));

    return [...existing, ...blueprint];
  }, [blueprintRoles, strategies]);

  const handleChange = useCallback(
    (field: keyof OrchestratorFormState, value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const toggleStrategy = useCallback((strategyId: string) => {
    setForm((previous) => ({
      ...previous,
      selectedStrategyIds: toggleValue(
        previous.selectedStrategyIds,
        strategyId,
      ),
    }));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!form.campaignLabel.trim()) {
        notificationsService.error('Campaign label is required.');
        return;
      }

      if (
        form.selectedStrategyIds.length === 0 &&
        (!selectedBlueprint || selectedBlueprint.roleIds.length === 0)
      ) {
        notificationsService.error(
          'Select an existing strategy or include a blueprint.',
        );
        return;
      }

      setIsSubmitting(true);

      try {
        let goalId: string | undefined;

        if (form.goalLabel.trim() && Number(form.goalTargetValue) > 0) {
          const goalsService = await getGoalsService();
          const goal = await goalsService.create(
            buildContentTeamGoalInput({
              brandId: form.brandId || undefined,
              description: form.goalDescription,
              label: form.goalLabel,
              metric: form.goalMetric,
              targetValue: Number(form.goalTargetValue),
            }),
          );
          goalId = goal.id;
        }

        const strategiesService = await getStrategiesService();
        const createdBlueprintStrategies: Array<{
          roleId: string;
          strategy: AgentStrategy;
        }> = [];

        if (selectedBlueprint) {
          const blueprintPayloads = buildBlueprintStrategyInputs(
            selectedBlueprint.id,
            {
              brandId: form.brandId || undefined,
              goalId,
              persona: form.persona,
              reportsToLabel: form.reportsToLabel,
              sharedTopic: form.sharedTopic,
            },
          );

          for (const [index, payload] of blueprintPayloads.entries()) {
            const created = await strategiesService.create(payload);
            createdBlueprintStrategies.push({
              roleId: selectedBlueprint.roleIds[index],
              strategy: created,
            });
          }
        }

        const agentIds = [
          ...form.selectedStrategyIds,
          ...createdBlueprintStrategies.map(({ strategy }) => strategy.id),
        ];

        let campaignLeadStrategyId: string | undefined;
        if (form.leadSelection.startsWith('existing:')) {
          campaignLeadStrategyId = form.leadSelection.replace('existing:', '');
        } else if (form.leadSelection.startsWith('blueprint:')) {
          const roleId = form.leadSelection.replace('blueprint:', '');
          campaignLeadStrategyId = createdBlueprintStrategies.find(
            (item) => item.roleId === roleId,
          )?.strategy.id;
        }

        if (!campaignLeadStrategyId) {
          campaignLeadStrategyId = agentIds[0];
        }

        const campaignsService = await getCampaignsService();
        await campaignsService.create(
          buildContentTeamCampaignInput({
            agentIds,
            brief: form.campaignBrief,
            campaignLeadStrategyId,
            creditsAllocated: Number(form.creditsAllocated) || 0,
            label: form.campaignLabel,
          }),
        );

        notificationsService.success('Content team orchestrator launched');
        push('/orchestration');
      } catch (error) {
        logger.error('Failed to launch content team orchestrator', { error });
        notificationsService.error('Unable to launch orchestrator');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      form.brandId,
      form.campaignBrief,
      form.campaignLabel,
      form.creditsAllocated,
      form.goalDescription,
      form.goalLabel,
      form.goalMetric,
      form.goalTargetValue,
      form.leadSelection,
      form.persona,
      form.reportsToLabel,
      form.selectedStrategyIds,
      form.sharedTopic,
      getCampaignsService,
      getGoalsService,
      getStrategiesService,
      notificationsService,
      push,
      selectedBlueprint,
    ],
  );

  return {
    blueprintRoles,
    brands,
    form,
    handleChange,
    handleSubmit,
    isSubmitting,
    leadOptions,
    push,
    selectedBlueprint,
    strategies,
    toggleStrategy,
  };
}
