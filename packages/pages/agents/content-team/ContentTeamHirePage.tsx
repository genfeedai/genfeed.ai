'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  buildRoleStrategyInput,
  CONTENT_TEAM_ROLE_PRESETS,
} from '@pages/agents/content-team/content-team-presets';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
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
import { HiOutlineUserPlus } from 'react-icons/hi2';

interface HireFormState {
  brandId: string;
  budget: string;
  label: string;
  persona: string;
  reportsToLabel: string;
  rolePresetId: string;
  sharedTopic: string;
  teamGroup: string;
}

export default function ContentTeamHirePage() {
  const router = useRouter();
  const notificationsService = NotificationsService.getInstance();
  const { brandId, brands } = useBrand();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<HireFormState>({
    brandId,
    budget: '',
    label: '',
    persona: '',
    reportsToLabel: 'Main Orchestrator',
    rolePresetId: CONTENT_TEAM_ROLE_PRESETS[0]?.id ?? '',
    sharedTopic: '',
    teamGroup: '',
  });

  const getStrategiesService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const selectedPreset = useMemo(
    () =>
      CONTENT_TEAM_ROLE_PRESETS.find(
        (preset) => preset.id === form.rolePresetId,
      ) ?? CONTENT_TEAM_ROLE_PRESETS[0],
    [form.rolePresetId],
  );

  const handleChange = useCallback(
    (field: keyof HireFormState, value: string) => {
      setForm((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!selectedPreset) {
        notificationsService.error('Choose a role before hiring.');
        return;
      }

      setIsSubmitting(true);

      try {
        const service = await getStrategiesService();
        await service.create({
          ...buildRoleStrategyInput({
            brandId: form.brandId || undefined,
            budget: form.budget ? Number(form.budget) : undefined,
            label: form.label,
            persona: form.persona,
            reportsToLabel: form.reportsToLabel,
            rolePresetId: form.rolePresetId,
            sharedTopic: form.sharedTopic,
            teamGroup: form.teamGroup,
          }),
          isActive: true,
        });

        notificationsService.success('Agent hired successfully');
        router.push('/orchestration');
      } catch (error) {
        logger.error('Failed to hire content team agent', { error });
        notificationsService.error('Unable to hire agent');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      form.budget,
      form.brandId,
      form.label,
      form.persona,
      form.reportsToLabel,
      form.rolePresetId,
      form.sharedTopic,
      form.teamGroup,
      getStrategiesService,
      notificationsService,
      router,
      selectedPreset,
    ],
  );

  return (
    <Container
      description="Create a specialist content role on top of the existing strategy system."
      icon={HiOutlineUserPlus}
      label="Hire Agent"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-role"
              >
                Role Preset
              </label>
              <Select
                value={form.rolePresetId}
                onValueChange={(value) => handleChange('rolePresetId', value)}
              >
                <SelectTrigger id="content-team-role">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TEAM_ROLE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.displayRole}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-agent-label"
              >
                Agent Label
              </label>
              <Input
                id="content-team-agent-label"
                onChange={(event) => handleChange('label', event.target.value)}
                placeholder={selectedPreset?.defaultLabel ?? 'Agent label'}
                value={form.label}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-brand"
              >
                Brand
              </label>
              <Select
                value={form.brandId}
                onValueChange={(value) => handleChange('brandId', value)}
              >
                <SelectTrigger id="content-team-brand">
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

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-budget"
              >
                Daily Budget
              </label>
              <Input
                id="content-team-budget"
                min={0}
                onChange={(event) => handleChange('budget', event.target.value)}
                placeholder={String(selectedPreset?.defaultBudget ?? 0)}
                type="number"
                value={form.budget}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-reports-to"
              >
                Reports To
              </label>
              <Input
                id="content-team-reports-to"
                onChange={(event) =>
                  handleChange('reportsToLabel', event.target.value)
                }
                placeholder="Main Orchestrator"
                value={form.reportsToLabel}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="content-team-group"
              >
                Team Group
              </label>
              <Input
                id="content-team-group"
                onChange={(event) =>
                  handleChange('teamGroup', event.target.value)
                }
                placeholder={selectedPreset?.teamGroup ?? 'Production'}
                value={form.teamGroup}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="content-team-persona"
            >
              Shared Persona
            </label>
            <Textarea
              id="content-team-persona"
              onChange={(event) => handleChange('persona', event.target.value)}
              placeholder="Describe the creator voice, tone, and positioning for this role."
              rows={4}
              value={form.persona}
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="content-team-topic"
            >
              Primary Topic
            </label>
            <Input
              id="content-team-topic"
              onChange={(event) =>
                handleChange('sharedTopic', event.target.value)
              }
              placeholder="e.g. creator monetization, AI productivity, ecommerce"
              value={form.sharedTopic}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              label={isSubmitting ? 'Hiring…' : 'Hire Agent'}
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
          description={selectedPreset?.description}
          label={selectedPreset?.displayRole ?? 'Role Preview'}
        >
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div>
              <p className="text-foreground/45">Agent Type</p>
              <p className="mt-1 font-medium text-foreground">
                {selectedPreset?.type ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-foreground/45">Default Platforms</p>
              <p className="mt-1 font-medium text-foreground">
                {selectedPreset?.platforms.join(', ') ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-foreground/45">Suggested Team Group</p>
              <p className="mt-1 font-medium text-foreground">
                {form.teamGroup || selectedPreset?.teamGroup || '—'}
              </p>
            </div>
            <div>
              <p className="text-foreground/45">Suggested Budget</p>
              <p className="mt-1 font-medium text-foreground">
                {form.budget || selectedPreset?.defaultBudget || 0} credits /
                day
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Container>
  );
}
