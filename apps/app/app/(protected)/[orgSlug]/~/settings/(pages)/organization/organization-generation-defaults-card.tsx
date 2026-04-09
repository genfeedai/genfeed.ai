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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useState } from 'react';

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

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Text Content
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Controls the baseline models used for content writing, review, and
              revision workflows. Brand-level content model overrides can
              replace the generation step for a specific brand.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="org-default-content-model"
                className="mb-1 block text-sm font-medium"
              >
                Content Generation Model
              </label>
              <Select
                onValueChange={(value) =>
                  setDefaults((current) => ({
                    ...current,
                    defaultModel: value === 'none' ? '' : value,
                  }))
                }
                value={defaults.defaultModel || 'none'}
              >
                <SelectTrigger
                  id="org-default-content-model"
                  className="w-full"
                >
                  <SelectValue placeholder="Select a text model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="org-default-content-review-model"
                className="mb-1 block text-sm font-medium"
              >
                Content Review Model
              </label>
              <Select
                onValueChange={(value) =>
                  setDefaults((current) => ({
                    ...current,
                    defaultModelReview: value === 'none' ? '' : value,
                  }))
                }
                value={defaults.defaultModelReview || 'none'}
              >
                <SelectTrigger
                  id="org-default-content-review-model"
                  className="w-full"
                >
                  <SelectValue placeholder="Select a review model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="org-default-content-revision-model"
                className="mb-1 block text-sm font-medium"
              >
                Content Revision Model
              </label>
              <Select
                onValueChange={(value) =>
                  setDefaults((current) => ({
                    ...current,
                    defaultModelUpdate: value === 'none' ? '' : value,
                  }))
                }
                value={defaults.defaultModelUpdate || 'none'}
              >
                <SelectTrigger
                  id="org-default-content-revision-model"
                  className="w-full"
                >
                  <SelectValue placeholder="Select a revision model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {enabledModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Auto keeps the system-selected defaults for each text stage. Use
            these only when you want a workspace-wide override for content
            writing flows.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Media
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              These are the organization-level baseline models for image, video,
              image-to-video, and music generation. Brands can inherit them or
              override them in brand settings.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="org-default-image-model"
                className="mb-1 block text-sm font-medium"
              >
                Default Image Model
              </label>
              <Select
                onValueChange={(value) =>
                  setDefaults((current) => ({
                    ...current,
                    defaultImageModel: value === 'none' ? '' : value,
                  }))
                }
                value={defaults.defaultImageModel || 'none'}
              >
                <SelectTrigger id="org-default-image-model" className="w-full">
                  <SelectValue placeholder="Select an image model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {imageModels.map((model) => (
                    <SelectItem key={model.id} value={model.key}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="org-default-video-model"
                className="mb-1 block text-sm font-medium"
              >
                Default Video Model
              </label>
              <Select
                onValueChange={(value) =>
                  setDefaults((current) => ({
                    ...current,
                    defaultVideoModel: value === 'none' ? '' : value,
                  }))
                }
                value={defaults.defaultVideoModel || 'none'}
              >
                <SelectTrigger id="org-default-video-model" className="w-full">
                  <SelectValue placeholder="Select a video model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {videoModels.map((model) => (
                    <SelectItem key={model.id} value={model.key}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="org-default-image-to-video-model"
                className="mb-1 block text-sm font-medium"
              >
                Default Image-to-Video Model
              </label>
              <Select
                onValueChange={(value) =>
                  setDefaults((current) => ({
                    ...current,
                    defaultImageToVideoModel: value === 'none' ? '' : value,
                  }))
                }
                value={defaults.defaultImageToVideoModel || 'none'}
              >
                <SelectTrigger
                  id="org-default-image-to-video-model"
                  className="w-full"
                >
                  <SelectValue placeholder="Select an image-to-video model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {videoModels.map((model) => (
                    <SelectItem key={model.id} value={model.key}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="org-default-music-model"
                className="mb-1 block text-sm font-medium"
              >
                Default Music Model
              </label>
              <Select
                onValueChange={(value) =>
                  setDefaults((current) => ({
                    ...current,
                    defaultMusicModel: value === 'none' ? '' : value,
                  }))
                }
                value={defaults.defaultMusicModel || 'none'}
              >
                <SelectTrigger id="org-default-music-model" className="w-full">
                  <SelectValue placeholder="Select a music model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use system default</SelectItem>
                  {musicModels.map((model) => (
                    <SelectItem key={model.id} value={model.key}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

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
