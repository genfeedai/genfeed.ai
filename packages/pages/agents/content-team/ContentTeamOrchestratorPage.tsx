'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
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
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineRectangleGroup } from 'react-icons/hi2';

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

export default function ContentTeamOrchestratorPage() {
  const router = useRouter();
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
        router.push('/orchestration');
      } catch (error) {
        logger.error('Failed to launch content team orchestrator', { error });
        notificationsService.error('Unable to launch orchestrator');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      form.blueprintId,
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
      router,
      selectedBlueprint,
    ],
  );

  return (
    <Container
      description="Create a role-first campaign lead on top of the existing campaign and goal system."
      icon={HiOutlineRectangleGroup}
      label="Launch Orchestrator"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-campaign-label"
              >
                Campaign Label
              </label>
              <Input
                id="content-team-campaign-label"
                onChange={(event) =>
                  handleChange('campaignLabel', event.target.value)
                }
                placeholder="Creator launch team"
                value={form.campaignLabel}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-brand-id"
              >
                Brand
              </label>
              <Select
                value={form.brandId}
                onValueChange={(value) => handleChange('brandId', value)}
              >
                <SelectTrigger id="content-team-brand-id">
                  <SelectValue placeholder="Choose a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="content-team-campaign-brief"
            >
              Objective
            </label>
            <Textarea
              id="content-team-campaign-brief"
              onChange={(event) =>
                handleChange('campaignBrief', event.target.value)
              }
              placeholder="Describe the campaign lead objective, quota, and approval expectations."
              rows={4}
              value={form.campaignBrief}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-blueprint"
              >
                Blueprint
              </label>
              <Select
                value={form.blueprintId}
                onValueChange={(value) => handleChange('blueprintId', value)}
              >
                <SelectTrigger id="content-team-blueprint">
                  <SelectValue placeholder="Choose a blueprint" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TEAM_BLUEPRINT_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-campaign-lead"
              >
                Campaign Lead
              </label>
              <Select
                value={form.leadSelection}
                onValueChange={(value) => handleChange('leadSelection', value)}
              >
                <SelectTrigger id="content-team-campaign-lead">
                  <SelectValue placeholder="Choose a lead" />
                </SelectTrigger>
                <SelectContent>
                  {leadOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-credits"
              >
                Shared Budget
              </label>
              <Input
                id="content-team-credits"
                min={0}
                onChange={(event) =>
                  handleChange('creditsAllocated', event.target.value)
                }
                type="number"
                value={form.creditsAllocated}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Existing Specialists
            </p>
            <div className="space-y-2 rounded border border-white/[0.08] p-4">
              {strategies.length === 0 ? (
                <p className="text-sm text-foreground/50">
                  No existing strategies found. The blueprint can still create
                  the initial team.
                </p>
              ) : (
                strategies.map((strategy) => (
                  <label
                    key={strategy.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {strategy.label}
                      </p>
                      <p className="text-xs text-foreground/50">
                        {strategy.displayRole ?? strategy.agentType}
                      </p>
                    </div>
                    <Checkbox
                      aria-label={`Select ${strategy.label}`}
                      checked={form.selectedStrategyIds.includes(strategy.id)}
                      onCheckedChange={() => toggleStrategy(strategy.id)}
                    />
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-persona"
              >
                Shared Persona
              </label>
              <Textarea
                id="content-team-persona"
                onChange={(event) =>
                  handleChange('persona', event.target.value)
                }
                placeholder="Describe the brand operator voice for the whole team."
                rows={4}
                value={form.persona}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-topic"
              >
                Shared Topic
              </label>
              <Input
                id="content-team-topic"
                onChange={(event) =>
                  handleChange('sharedTopic', event.target.value)
                }
                placeholder="e.g. creator commerce, AI tutorials, growth loops"
                value={form.sharedTopic}
              />
              <label
                className="mt-4 block text-sm font-medium text-foreground"
                htmlFor="content-team-reports"
              >
                Reports To
              </label>
              <Input
                id="content-team-reports"
                onChange={(event) =>
                  handleChange('reportsToLabel', event.target.value)
                }
                placeholder="Main Orchestrator"
                value={form.reportsToLabel}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-goal-label"
              >
                Company Goal Label
              </label>
              <Input
                id="content-team-goal-label"
                onChange={(event) =>
                  handleChange('goalLabel', event.target.value)
                }
                placeholder="April views target"
                value={form.goalLabel}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-goal-metric"
              >
                Goal Metric
              </label>
              <Select
                value={form.goalMetric}
                onValueChange={(value) =>
                  handleChange(
                    'goalMetric',
                    value as 'engagement_rate' | 'posts' | 'views',
                  )
                }
              >
                <SelectTrigger id="content-team-goal-metric">
                  <SelectValue placeholder="Choose a metric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="views">Views</SelectItem>
                  <SelectItem value="posts">Posts</SelectItem>
                  <SelectItem value="engagement_rate">
                    Engagement Rate
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-goal-target"
              >
                Goal Target
              </label>
              <Input
                id="content-team-goal-target"
                min={0}
                onChange={(event) =>
                  handleChange('goalTargetValue', event.target.value)
                }
                type="number"
                value={form.goalTargetValue}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="content-team-goal-description"
            >
              Goal Context
            </label>
            <Textarea
              id="content-team-goal-description"
              onChange={(event) =>
                handleChange('goalDescription', event.target.value)
              }
              placeholder="Explain what winning this campaign should look like."
              rows={3}
              value={form.goalDescription}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              label={isSubmitting ? 'Launching…' : 'Launch Team'}
              type="submit"
              variant={ButtonVariant.DEFAULT}
            />
            <Button
              label="Cancel"
              onClick={() => router.push('/orchestration')}
              type="button"
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        </form>

        <Card
          bodyClassName="space-y-4 p-5"
          description={selectedBlueprint?.description}
          label={selectedBlueprint?.label ?? 'Blueprint Preview'}
        >
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-foreground/45">Planned Roles</p>
              <p className="mt-1 font-medium text-foreground">
                {blueprintRoles.map((role) => role.displayRole).join(', ')}
              </p>
            </div>
            <div>
              <p className="text-foreground/45">Approval Policy</p>
              <p className="mt-1 font-medium text-foreground">Manual review</p>
            </div>
            <div>
              <p className="text-foreground/45">Existing Agents Attached</p>
              <p className="mt-1 font-medium text-foreground">
                {form.selectedStrategyIds.length}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
