'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  buildRoleStrategyInput,
  CONTENT_TEAM_ROLE_PRESETS,
} from '@pages/agents/content-team/content-team-presets';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { HireForm } from './HireForm';

interface HireFormState {
  budget: string;
  label: string;
  persona: string;
  reportsToLabel: string;
  rolePresetId: string;
  sharedTopic: string;
  teamGroup: string;
}

interface ContentTeamHirePageProps {
  isEmbedded?: boolean;
  onCancel?: () => void;
  onCreated?: () => Promise<void> | void;
}

export default function ContentTeamHirePage({
  isEmbedded = false,
  onCancel,
  onCreated,
}: ContentTeamHirePageProps) {
  const translate = useTranslations('common.automation.agentCreation');
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const collectionScope = useCollectionScope();
  const { brandId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<HireFormState>({
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
    if (onCancel) {
      onCancel();
      return;
    }

    push(href(APP_ROUTES.AUTOMATION.AGENTS));
  }, [href, onCancel, push]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!isBrandReady || !brandId) {
        notificationsService.error(
          pageScope === 'org'
            ? 'Select a brand to hire an agent.'
            : 'Wait for the selected brand to finish loading.',
        );
        return;
      }

      if (!selectedPreset) {
        notificationsService.error('Choose a role before hiring.');
        return;
      }

      setIsSubmitting(true);

      try {
        const service = await getStrategiesService();
        await service.create({
          ...buildRoleStrategyInput({
            brandId: brandId || undefined,
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

        notificationsService.success('Agent added successfully');
        if (onCreated) {
          await onCreated();
        } else {
          push(href(APP_ROUTES.AUTOMATION.AGENTS));
        }
      } catch (error) {
        logger.error('Failed to hire content team agent', { error });
        notificationsService.error('Unable to hire agent');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      brandId,
      form.budget,
      form.label,
      form.persona,
      form.reportsToLabel,
      form.rolePresetId,
      form.sharedTopic,
      form.teamGroup,
      getStrategiesService,
      href,
      isBrandReady,
      notificationsService,
      pageScope,
      onCreated,
      push,
      selectedPreset,
    ],
  );

  const content =
    !isBrandReady || !brandId ? (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {translate(pageScope === 'org' ? 'selectBrand' : 'loadingBrand')}
      </p>
    ) : (
      <div className="mx-auto w-full max-w-3xl">
        <HireForm
          form={form}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onChange={handleChange}
          onSubmit={handleSubmit}
          selectedPreset={selectedPreset}
        />
      </div>
    );

  if (isEmbedded) {
    return content;
  }

  return (
    <Container
      description="Create a specialist content role on top of the existing strategy system."
      icon={UserPlus}
      label="Hire Agent"
    >
      {content}
    </Container>
  );
}
