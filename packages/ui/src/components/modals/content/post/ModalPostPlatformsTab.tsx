'use client';

import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  parsePlatform,
} from '@genfeedai/contracts';
import { resolveChannelTargetSettings } from '@genfeedai/contracts/api-types/contracts';
import type {
  IIngredient,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { usePostingSets } from '@genfeedai/hooks/data/content/use-posting-sets/use-posting-sets';
import { usePostingSignatures } from '@genfeedai/hooks/data/content/use-posting-signatures/use-posting-signatures';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import type { ModalPostPlatformsTabProps } from '@genfeedai/props/modals/modal.props';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { createPromptHandler } from '@genfeedai/services/core/socket-manager.service';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import PlatformPreview, {
  buildMediaFromIngredients,
  type PlatformPreviewTarget,
} from '@ui/posts/platform-preview/PlatformPreview';
import { Button } from '@ui/primitives/button';
import PostingSetPicker from '@ui/publisher/PostingSetPicker';
import PostingSignaturePicker from '@ui/publisher/PostingSignaturePicker';
import { Eye, EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModalPostPlatformCard from './ModalPostPlatformCard';
import ModalPostPlatformGrid from './ModalPostPlatformGrid';
import {
  PLATFORM_TO_CONTENT_CATEGORY,
  PLATFORM_TO_SYSTEM_PROMPT_KEY,
  PLATFORM_TO_TITLE_CATEGORY,
} from './platform-map.constants';

export default function ModalPostPlatformsTab({
  applyEnabledCredentialIds,
  form,
  ingredients,
  platformConfigs,
  isLoading,
  ingredient,
  togglePlatform,
  updatePlatformConfig,
  getMinDateTime,
}: ModalPostPlatformsTabProps) {
  const globalLabel = form.watch('globalLabel');
  const globalDescription = form.watch('globalDescription');
  const [generatingTitleFor, setGeneratingTitleFor] = useState<string | null>(
    null,
  );
  const [generatingDescFor, setGeneratingDescFor] = useState<string | null>(
    null,
  );
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [selectedSetId, setSelectedSetId] = useState<string | undefined>();
  const {
    createSet,
    expandError,
    expandSet,
    isExpanding,
    isSaving,
    saveError,
    sets,
  } = usePostingSets();
  const { signatures } = usePostingSignatures();
  const previewTargets = useMemo(
    () =>
      buildComposerPreviewTargets(
        platformConfigs,
        ingredients ?? (ingredient ? [ingredient] : undefined),
        globalLabel,
        globalDescription,
      ),
    [globalDescription, globalLabel, ingredient, ingredients, platformConfigs],
  );

  const getPromptsService = useAuthedService((token) =>
    PromptsService.getInstance(token),
  );

  const { subscribe } = useSocketManager();
  const subscriptionRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupSubscription();
    };
  }, [cleanupSubscription]);

  const listenForSocket = useCallback(
    (
      promptId: string,
      credentialId: string,
      field: 'label' | 'description',
    ) => {
      const event = WebSocketPaths.prompt(promptId);
      const setGenerating =
        field === 'label' ? setGeneratingTitleFor : setGeneratingDescFor;

      timeoutRef.current = setTimeout(() => {
        logger.error(`Post content generation timed out for ${promptId}`);
        setGenerating(null);
        cleanupSubscription();
      }, 30000);

      const handler = createPromptHandler<string>(
        (result: string) => {
          cleanupSubscription();
          updatePlatformConfig(credentialId, { [field]: result });
          setGenerating(null);
        },
        (error: string) => {
          cleanupSubscription();
          logger.error('Post content generation failed via websocket', error);
          setGenerating(null);
        },
      );

      cleanupSubscription();
      subscriptionRef.current = subscribe(event, handler);
    },
    [cleanupSubscription, subscribe, updatePlatformConfig],
  );

  const handleGenerateContent = useCallback(
    async (
      credentialId: string,
      platform: string,
      field: 'title' | 'description',
    ) => {
      const isTitle = field === 'title';
      const setGenerating = isTitle
        ? setGeneratingTitleFor
        : setGeneratingDescFor;
      const categoryMap = isTitle
        ? PLATFORM_TO_TITLE_CATEGORY
        : PLATFORM_TO_CONTENT_CATEGORY;

      setGenerating(credentialId);
      const url = 'POST /prompts';

      try {
        const service = await getPromptsService();
        const promptCategory = categoryMap[platform.toLowerCase()];

        if (!promptCategory) {
          throw new Error(`Unsupported platform: ${platform}`);
        }

        // Get the appropriate system prompt key based on field type
        const platformKeys =
          PLATFORM_TO_SYSTEM_PROMPT_KEY[platform.toLowerCase()];
        const systemPromptKey = isTitle
          ? platformKeys?.title
          : platformKeys?.content;

        const prompt = await service.post(
          new Prompt({
            category: promptCategory,
            isSkipEnhancement: false,
            original: isTitle ? globalLabel || '' : globalDescription || '',
            systemPromptKey,
            useRAG: true, // Enable RAG if context bases exist
          }),
        );

        logger.info(`${url} success`, { field, platform, promptId: prompt.id });

        listenForSocket(
          prompt.id,
          credentialId,
          isTitle ? 'label' : 'description',
        );
      } catch (error) {
        logger.error(`${url} failed`, error);
        setGenerating(null);
      }
    },
    [globalLabel, globalDescription, getPromptsService, listenForSocket],
  );

  const handleSelectSet = useCallback(
    async (id: string) => {
      setSelectedSetId(id);
      const expanded = await expandSet(id);
      applyEnabledCredentialIds?.(
        expanded.map((target) => target.credentialId),
      );
      for (const target of expanded) {
        if (target.scheduledDate) {
          updatePlatformConfig(target.credentialId, {
            customScheduledDate: target.scheduledDate,
            overrideSchedule: true,
          });
        }
      }
    },
    [applyEnabledCredentialIds, expandSet, updatePlatformConfig],
  );

  const handleSaveCurrent = useCallback(
    async (label: string) => {
      const enabled = platformConfigs.filter((config) => config.enabled);
      if (enabled.length === 0) {
        return;
      }
      await createSet({
        label,
        targets: enabled.flatMap((config, order) => {
          const platform = parsePlatform(config.platform);
          if (!platform) {
            return [];
          }
          return [
            {
              credentialId: config.credentialId,
              order,
              platform,
              ...(config.signatureIds && config.signatureIds.length > 0
                ? { signatureIds: config.signatureIds }
                : {}),
              targetKey: `${config.platform}:${config.credentialId}`,
            },
          ];
        }),
      });
    },
    [createSet, platformConfigs],
  );

  return (
    <>
      <PostingSetPicker
        canSave={platformConfigs.some((config) => config.enabled)}
        expandError={expandError ?? undefined}
        isExpanding={isExpanding}
        isSaving={isSaving}
        onSaveCurrent={(label) => {
          void handleSaveCurrent(label);
        }}
        onSelectSet={(id) => {
          void handleSelectSet(id);
        }}
        saveError={saveError ?? undefined}
        selectedSetId={selectedSetId}
        sets={sets}
      />
      <ModalPostPlatformGrid
        platformConfigs={platformConfigs}
        togglePlatform={togglePlatform}
      />

      {/* Platform-specific customization */}
      <div className="border-t pt-4 space-y-4">
        <h4 className="font-medium">Platform-Specific Settings</h4>
        <p className="text-sm text-foreground/70">
          Enable a platform above to customise its title, description, and
          scheduling options.
        </p>

        {platformConfigs.filter((config) => config.enabled).length === 0 ? (
          <div className="bg-card/40 shadow-border p-6 text-sm text-foreground/70">
            Enable a platform above to configure its publishing content.
          </div>
        ) : (
          <div className="space-y-4">
            {platformConfigs.reduce<ReactNode[]>((acc, config) => {
              if (!config.enabled) return acc;
              const hasCredential = !!config.credentialId;
              const isCredentialValid = config.isCredentialValid !== false;
              const isEnabled =
                hasCredential && isCredentialValid && config.enabled;
              const isTwitter = config.platform === CredentialPlatform.TWITTER;
              const isYoutube = config.platform === CredentialPlatform.YOUTUBE;
              const isInstagram =
                config.platform === CredentialPlatform.INSTAGRAM;
              const currentLength = config.description?.length ?? 0;

              const node = (
                <div key={config.platform} className="space-y-2">
                  <ModalPostPlatformCard
                    config={config}
                    isLoading={isLoading}
                    isEnabled={isEnabled}
                    isTwitter={isTwitter}
                    isYoutube={isYoutube}
                    isInstagram={isInstagram}
                    currentLength={currentLength}
                    globalLabel={globalLabel}
                    globalDescription={globalDescription}
                    generatingTitleFor={generatingTitleFor}
                    generatingDescFor={generatingDescFor}
                    updatePlatformConfig={updatePlatformConfig}
                    getMinDateTime={getMinDateTime}
                    handleGenerateContent={handleGenerateContent}
                  />
                  <PostingSignaturePicker
                    onChange={(signatureIds) =>
                      updatePlatformConfig(config.credentialId, {
                        signatureIds,
                      })
                    }
                    platform={config.platform}
                    selectedIds={config.signatureIds ?? []}
                    signatures={signatures}
                  />
                </div>
              );
              acc.push(node);
              return acc;
            }, [])}
          </div>
        )}
      </div>

      {previewTargets.length > 0 ? (
        <div className="border-t pt-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-medium">Live preview</h4>
              <p className="text-sm text-foreground/70">
                Platform-tuned preview of each enabled channel, updated as you
                type.
              </p>
            </div>
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              onClick={() => setIsPreviewVisible((isVisible) => !isVisible)}
              icon={
                isPreviewVisible ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )
              }
              label={isPreviewVisible ? 'Hide preview' : 'Show preview'}
            />
          </div>
          {isPreviewVisible ? (
            <PlatformPreview targets={previewTargets} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function buildComposerPreviewTargets(
  platformConfigs: IPostPlatformConfig[],
  ingredients: IIngredient[] | undefined,
  globalLabel = '',
  globalDescription = '',
): PlatformPreviewTarget[] {
  const media = buildMediaFromIngredients(ingredients);

  return platformConfigs
    .filter(
      (config) =>
        config.enabled &&
        config.isCredentialValid !== false &&
        config.credentialId.trim().length > 0,
    )
    .map((config) => {
      const overrides: Record<string, unknown> = {};

      if (config.platform === CredentialPlatform.INSTAGRAM) {
        const isVideo =
          config.category === PostCategory.VIDEO ||
          media.some((item) => ['short_video', 'video'].includes(item.kind));
        overrides.placement = isVideo ? 'reel' : 'feed';
      }

      // YouTube's privacyStatus is an audience choice, so it follows the
      // target's visibility rather than its lifecycle state.
      if (
        config.platform === CredentialPlatform.YOUTUBE &&
        [
          PostVisibility.PRIVATE,
          PostVisibility.PUBLIC,
          PostVisibility.UNLISTED,
        ].includes(config.visibility)
      ) {
        overrides.privacyStatus = config.visibility;
      }

      return {
        author: { handle: config.handle },
        caption: config.description || globalDescription,
        media,
        platform: config.platform,
        publishMode: 'scheduled',
        settings: resolveChannelTargetSettings(config.platform, overrides),
        title: config.label || globalLabel,
      };
    });
}
