'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  type AgentGenerationPriority,
  AgentSettings,
  type AgentSettingsValues,
} from '@genfeedai/agent';
import { AlertCategory } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { User } from '@models/auth/user.model';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { BrandsService } from '@services/social/brands.service';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { useParams } from 'next/navigation';
import { type ReactElement, useCallback, useMemo } from 'react';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

const DEFAULT_GENERATION_PRIORITY: AgentGenerationPriority = 'balanced';

interface ConfigurationErrorStateProps {
  actionLabel: string;
  message: string;
  onRetry: () => Promise<void>;
}

function ConfigurationErrorState({
  actionLabel,
  message,
  onRetry,
}: ConfigurationErrorStateProps): ReactElement {
  return (
    <div className="space-y-4">
      <Alert type={AlertCategory.ERROR}>{message}</Alert>
      <Button label={actionLabel} onClick={() => void onRetry()} />
    </div>
  );
}

export default function AgentConfigurationPage(): ReactElement {
  const params = useParams<{ brandSlug: string; orgSlug: string }>();
  const { brandId, isReady, refreshBrands, selectedBrand } = useBrand();
  const { currentUser, isLoading, mutateUser, refetchUser } = useCurrentUser();
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const selectedBrandId = selectedBrand?.id ?? '';
  const isScopeMatch = Boolean(
    selectedBrandId &&
      selectedBrandId === brandId &&
      selectedBrand?.slug === params.brandSlug &&
      getBrandOrganizationSlug(selectedBrand) === params.orgSlug,
  );

  const initialSettings = useMemo<AgentSettingsValues>(
    () => ({
      defaultModel: selectedBrand?.agentConfig?.defaultModel ?? '',
      generationPriority:
        currentUser?.settings?.generationPriority ??
        DEFAULT_GENERATION_PRIORITY,
      persona: selectedBrand?.agentConfig?.persona ?? '',
    }),
    [
      currentUser?.settings?.generationPriority,
      selectedBrand?.agentConfig?.defaultModel,
      selectedBrand?.agentConfig?.persona,
    ],
  );

  const isDefaultState =
    selectedBrand?.agentConfig?.defaultModel == null &&
    selectedBrand?.agentConfig?.persona == null &&
    currentUser?.settings?.generationPriority == null;

  const handleSave = useCallback(
    async (settings: AgentSettingsValues): Promise<void> => {
      if (!currentUser || !isScopeMatch || !selectedBrandId) {
        throw new Error('Agent configuration scope is unavailable');
      }

      try {
        const [brandsService, usersService] = await Promise.all([
          getBrandsService(),
          getUsersService(),
        ]);

        await Promise.all([
          brandsService.updateAgentConfig(selectedBrandId, {
            defaultModel: settings.defaultModel || undefined,
            persona: settings.persona || undefined,
          }),
          usersService.patchSettings(currentUser.id, {
            generationPriority: settings.generationPriority,
          }),
        ]);

        await refreshBrands();
        mutateUser(
          new User({
            ...currentUser,
            settings: {
              ...currentUser.settings,
              generationPriority: settings.generationPriority,
            },
          }),
        );
      } catch (error) {
        logger.error('Failed to save agent configuration', error);
        throw error;
      }
    },
    [
      currentUser,
      getBrandsService,
      getUsersService,
      isScopeMatch,
      mutateUser,
      refreshBrands,
      selectedBrandId,
    ],
  );

  let content: ReactElement;

  if (!isReady || isLoading) {
    content = (
      <Loading isFullSize={false} message="Loading agent configuration" />
    );
  } else if (!isScopeMatch) {
    content = (
      <ConfigurationErrorState
        actionLabel="Reload brand access"
        message="Agent configuration is unavailable for this brand. Return to an authorized brand or reload your access."
        onRetry={refreshBrands}
      />
    );
  } else if (!currentUser) {
    content = (
      <ConfigurationErrorState
        actionLabel="Retry settings"
        message="Your settings could not be loaded. Retry before editing agent configuration."
        onRetry={refetchUser}
      />
    );
  } else {
    content = (
      <AgentSettings
        key={`${selectedBrandId}:${currentUser.id}`}
        initialSettings={initialSettings}
        isDefaultState={isDefaultState}
        onSave={handleSave}
      />
    );
  }

  return (
    <Container label="Agent Configuration" icon={<HiOutlineCog6Tooth />}>
      {content}
    </Container>
  );
}
