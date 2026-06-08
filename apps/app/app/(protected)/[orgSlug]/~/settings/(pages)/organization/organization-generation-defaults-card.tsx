'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';
import OrganizationGenerationDefaultsMediaSection from './organization-generation-defaults-media-section';
import OrganizationGenerationDefaultsTextSection from './organization-generation-defaults-text-section';

type ExtendedOrganizationSettings = {
  defaultModel?: string;
  defaultModelReview?: string;
  defaultModelUpdate?: string;
  defaultImageModel?: string;
  defaultImageToVideoModel?: string;
  defaultMusicModel?: string;
  defaultVideoModel?: string;
  enabledModels?: string[];
};

type GenerationDefaultsState = {
  defaultModel: string;
  defaultModelReview: string;
  defaultModelUpdate: string;
  defaultImageModel: string;
  defaultImageToVideoModel: string;
  defaultMusicModel: string;
  defaultVideoModel: string;
};

export default function OrganizationGenerationDefaultsCard() {
  const notifications = NotificationsService.getInstance();
  const { organizationId } = useBrand();
  const { refresh, settings } = useOrganization();
  const settingsWithContentDefaults = settings as
    | (typeof settings & ExtendedOrganizationSettings)
    | undefined;
  const { imageModels, musicModels, videoModels } = useElements();
  const enabledModels = settingsWithContentDefaults?.enabledModels ?? [];
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [defaults, setDefaults] = useState<GenerationDefaultsState>({
    defaultImageModel: '',
    defaultImageToVideoModel: '',
    defaultModel: '',
    defaultModelReview: '',
    defaultModelUpdate: '',
    defaultMusicModel: '',
    defaultVideoModel: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDefaults({
      defaultImageModel: settingsWithContentDefaults?.defaultImageModel ?? '',
      defaultImageToVideoModel:
        settingsWithContentDefaults?.defaultImageToVideoModel ?? '',
      defaultModel: settingsWithContentDefaults?.defaultModel ?? '',
      defaultModelReview: settingsWithContentDefaults?.defaultModelReview ?? '',
      defaultModelUpdate: settingsWithContentDefaults?.defaultModelUpdate ?? '',
      defaultMusicModel: settingsWithContentDefaults?.defaultMusicModel ?? '',
      defaultVideoModel: settingsWithContentDefaults?.defaultVideoModel ?? '',
    });
  }, [
    settingsWithContentDefaults?.defaultModel,
    settingsWithContentDefaults?.defaultModelReview,
    settingsWithContentDefaults?.defaultModelUpdate,
    settingsWithContentDefaults?.defaultImageModel,
    settingsWithContentDefaults?.defaultImageToVideoModel,
    settingsWithContentDefaults?.defaultMusicModel,
    settingsWithContentDefaults?.defaultVideoModel,
  ]);

  const handleSave = useCallback(async () => {
    if (!organizationId) {
      notifications.error('Organization context is unavailable');
      return;
    }

    setIsSaving(true);

    try {
      const service = await getOrganizationsService();
      await service.patchSettings(organizationId, {
        defaultImageModel: defaults.defaultImageModel || null,
        defaultImageToVideoModel: defaults.defaultImageToVideoModel || null,
        defaultModel: defaults.defaultModel || null,
        defaultModelReview: defaults.defaultModelReview || null,
        defaultModelUpdate: defaults.defaultModelUpdate || null,
        defaultMusicModel: defaults.defaultMusicModel || null,
        defaultVideoModel: defaults.defaultVideoModel || null,
      } as never);
      await refresh();
      notifications.success('Organization generation defaults saved');
    } catch (error) {
      logger.error('Failed to save organization generation defaults', error);
      notifications.error('Failed to save organization generation defaults');
    } finally {
      setIsSaving(false);
    }
  }, [
    defaults,
    getOrganizationsService,
    notifications,
    organizationId,
    refresh,
  ]);

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Generation Defaults</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These are the organization-level baseline models. Brands can inherit
            them or override them individually.
          </p>
        </div>

        <OrganizationGenerationDefaultsTextSection
          enabledModels={enabledModels}
          defaultModel={defaults.defaultModel}
          defaultModelReview={defaults.defaultModelReview}
          defaultModelUpdate={defaults.defaultModelUpdate}
          onDefaultModelChange={(value) =>
            setDefaults((current) => ({ ...current, defaultModel: value }))
          }
          onDefaultModelReviewChange={(value) =>
            setDefaults((current) => ({
              ...current,
              defaultModelReview: value,
            }))
          }
          onDefaultModelUpdateChange={(value) =>
            setDefaults((current) => ({
              ...current,
              defaultModelUpdate: value,
            }))
          }
        />

        <OrganizationGenerationDefaultsMediaSection
          imageModels={imageModels}
          videoModels={videoModels}
          musicModels={musicModels}
          defaultImageModel={defaults.defaultImageModel}
          defaultVideoModel={defaults.defaultVideoModel}
          defaultImageToVideoModel={defaults.defaultImageToVideoModel}
          defaultMusicModel={defaults.defaultMusicModel}
          onDefaultImageModelChange={(value) =>
            setDefaults((current) => ({
              ...current,
              defaultImageModel: value,
            }))
          }
          onDefaultVideoModelChange={(value) =>
            setDefaults((current) => ({
              ...current,
              defaultVideoModel: value,
            }))
          }
          onDefaultImageToVideoModelChange={(value) =>
            setDefaults((current) => ({
              ...current,
              defaultImageToVideoModel: value,
            }))
          }
          onDefaultMusicModelChange={(value) =>
            setDefaults((current) => ({
              ...current,
              defaultMusicModel: value,
            }))
          }
        />

        <p className="text-xs text-muted-foreground">
          Brand-level defaults can override these values. Leaving a field on
          auto keeps the existing inheritance and system fallback behavior.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              handleSave().catch((error) => {
                logger.error(
                  'Failed to save organization generation defaults',
                  error,
                );
              });
            }}
            isDisabled={isSaving}
            withWrapper={false}
          >
            {isSaving ? 'Saving...' : 'Save Generation Defaults'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
