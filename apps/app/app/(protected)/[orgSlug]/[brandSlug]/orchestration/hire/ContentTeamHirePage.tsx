'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  buildRoleStrategyInput,
  CONTENT_TEAM_ROLE_PRESETS,
} from '@pages/agents/content-team/content-team-presets';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineUserPlus } from 'react-icons/hi2';
import { HireForm } from './HireForm';
import { RolePreviewCard } from './RolePreviewCard';

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
  const { push } = useRouter();
  const { href } = useOrgUrl();
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

  const handleCancel = useCallback(() => {
    push(href('/orchestration'));
  }, [href, push]);

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
        push(href('/orchestration'));
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
      href,
      notificationsService,
      push,
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
        <HireForm
          brands={brands}
          form={form}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onChange={handleChange}
          onSubmit={handleSubmit}
          selectedPreset={selectedPreset}
        />

        <RolePreviewCard
          budget={form.budget}
          selectedPreset={selectedPreset}
          teamGroup={form.teamGroup}
        />
      </div>
    </Container>
  );
}
