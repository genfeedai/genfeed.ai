'use client';

import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  PostCategory,
  PromptCategory,
  SystemPromptKey,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { Prompt } from '@models/content/prompt.model';
import type { ModalPostPlatformsTabProps } from '@props/modals/modal.props';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { createPromptHandler } from '@services/core/socket-manager.service';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { FaInstagram, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import { HiSparkles } from 'react-icons/hi2';

const platformIcons: Record<string, IconType> = {
  instagram: FaInstagram,
  tiktok: FaTiktok,
  twitter: FaXTwitter,
  youtube: FaYoutube,
};

const platformColors: Record<string, string> = {
  instagram: 'text-pink-500',
  tiktok: 'text-black',
  twitter: 'text-blue-400',
  youtube: 'text-red-500',
};

const PLATFORM_TO_CONTENT_CATEGORY: Record<string, PromptCategory> = {
  instagram: PromptCategory.POST_CONTENT_INSTAGRAM,
  tiktok: PromptCategory.POST_CONTENT_TIKTOK,
  twitter: PromptCategory.POST_CONTENT_TWITTER,
  youtube: PromptCategory.POST_CONTENT_YOUTUBE,
};

const PLATFORM_TO_TITLE_CATEGORY: Record<string, PromptCategory> = {
  instagram: PromptCategory.POST_TITLE_INSTAGRAM,
  tiktok: PromptCategory.POST_TITLE_TIKTOK,
  twitter: PromptCategory.POST_TITLE_TWITTER,
  youtube: PromptCategory.POST_TITLE_YOUTUBE,
};

// Platform to system prompt key mapping with content/title variants
const PLATFORM_TO_SYSTEM_PROMPT_KEY: Record<
  string,
  { content: SystemPromptKey; title: SystemPromptKey }
> = {
  instagram: {
    content: SystemPromptKey.INSTAGRAM_CONTENT,
    title: SystemPromptKey.INSTAGRAM_TITLE,
  },
  tiktok: {
    content: SystemPromptKey.TIKTOK_CONTENT,
    title: SystemPromptKey.TIKTOK_TITLE,
  },
  twitter: {
    content: SystemPromptKey.TWITTER_CONTENT,
    title: SystemPromptKey.TWITTER_TITLE,
  },
  youtube: {
    content: SystemPromptKey.YOUTUBE_CONTENT,
    title: SystemPromptKey.YOUTUBE_TITLE,
  },
};

export default function ModalPostPlatformsTab({
  form,
  platformConfigs,
  isLoading,
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

  return (
    <>
      {/* Platform selection */}
      <div className="mb-6">
        <label className="text-sm font-medium block mb-2">
          Available Platforms
        </label>

        <div className="grid grid-cols-4 gap-2">
          {platformConfigs.map((config) => {
            const Icon = platformIcons[config.platform];
            const color = platformColors[config.platform];
            const hasCredential = !!config.credentialId;
            const isCredentialValid = config.isCredentialValid !== false;
            const isEnabled =
              hasCredential && isCredentialValid && config.enabled;
            const isSelectable = hasCredential && isCredentialValid;

            return (
              <div
                key={config.platform}
                className={`bg-card border border-white/[0.08] p-3 ${
                  isEnabled
                    ? 'ring-2 ring-primary/40'
                    : !hasCredential
                      ? 'opacity-60'
                      : ''
                }`}
              >
                <label
                  className={`flex items-center gap-2 ${
                    hasCredential ? 'cursor-pointer' : 'cursor-not-allowed'
                  }`}
                >
                  <Checkbox
                    name={`platform-${config.platform}`}
                    isChecked={config.enabled}
                    onChange={() =>
                      isSelectable && togglePlatform(config.credentialId)
                    }
                    isDisabled={!isSelectable}
                  />
                  <div className="flex items-center gap-2 flex-1">
                    {Icon && (
                      <Icon
                        className={`w-4 h-4 ${hasCredential ? color : 'text-foreground/30'}`}
                      />
                    )}
                    {hasCredential && (
                      <span className="text-xs text-foreground/60">
                        @{config.handle}
                      </span>
                    )}
                  </div>
                </label>
                {hasCredential && !isCredentialValid && (
                  <span className="text-xs text-warning">
                    Reconnect account to enable
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Platform-specific customization */}
      <div className="border-t pt-4 space-y-4">
        <h4 className="font-medium">Platform-Specific Settings</h4>
        <p className="text-sm text-foreground/70">
          Enable a platform above to customise its title, description, and
          scheduling options.
        </p>

        {platformConfigs.filter((config) => config.enabled).length === 0 ? (
          <div className=" border border-dashed border-white/[0.08] bg-card/40 p-6 text-sm text-foreground/70">
            Enable a platform above to configure its publishing content.
          </div>
        ) : (
          <div className="space-y-4">
            {platformConfigs
              .filter((config) => config.enabled)
              .map((config) => {
                const hasCredential = !!config.credentialId;
                const isCredentialValid = config.isCredentialValid !== false;
                const isEnabled =
                  hasCredential && isCredentialValid && config.enabled;
                const Icon = platformIcons[config.platform];
                const color = platformColors[config.platform];
                const isTwitter =
                  config.platform === CredentialPlatform.TWITTER;
                const isYoutube =
                  config.platform === CredentialPlatform.YOUTUBE;
                const isInstagram =
                  config.platform === CredentialPlatform.INSTAGRAM;
                const currentLength = config.description?.length ?? 0;

                return (
                  <div
                    key={config.platform}
                    className={`bg-card border border-white/[0.08] p-4 space-y-3 ${
                      isEnabled ? '' : 'bg-muted/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {Icon && (
                          <Icon
                            className={`w-4 h-4 ${
                              hasCredential ? color : 'text-foreground/40'
                            }`}
                          />
                        )}
                        {hasCredential && (
                          <span className="text-xs text-foreground/60">
                            @{config.handle}
                          </span>
                        )}
                      </div>
                      {!hasCredential && (
                        <span className="text-xs text-warning">
                          Connect account to enable
                        </span>
                      )}
                      {hasCredential && !isCredentialValid && (
                        <span className="text-xs text-warning">
                          Reconnect account to publish
                        </span>
                      )}
                    </div>

                    {isYoutube && (
                      <FormControl label="YouTube Visibility">
                        <SelectField
                          name={`youtubeStatus-${config.credentialId || config.platform}`}
                          value={config.status || 'unlisted'}
                          onChange={(event) => {
                            if (!isEnabled) {
                              return;
                            }

                            updatePlatformConfig(config.credentialId, {
                              status: event.target.value,
                            });
                          }}
                          isDisabled={!isEnabled || isLoading}
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                          <option value="unlisted">Unlisted</option>
                          <option value="scheduled">Scheduled</option>
                        </SelectField>
                      </FormControl>
                    )}

                    {isInstagram && (
                      <div className="space-y-3">
                        <label className="text-sm font-medium">
                          Instagram Post Type
                        </label>

                        <div className="space-y-2">
                          {/* Image Post */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`instagramType-${config.credentialId || config.platform}`}
                              className="h-4 w-4 accent-primary"
                              checked={config.category === 'image'}
                              onChange={() => {
                                if (!isEnabled) {
                                  return;
                                }

                                updatePlatformConfig(config.credentialId, {
                                  category: PostCategory.IMAGE,
                                  isShareToFeedSelected: false,
                                });
                              }}
                              disabled={!isEnabled || isLoading}
                            />
                            <span className="text-sm">Image Post</span>
                          </label>

                          {/* Reel Only */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`instagramType-${config.credentialId || config.platform}`}
                              className="h-4 w-4 accent-primary"
                              checked={
                                config.category === PostCategory.VIDEO &&
                                !config.isShareToFeedSelected
                              }
                              onChange={() => {
                                if (!isEnabled) {
                                  return;
                                }

                                updatePlatformConfig(config.credentialId, {
                                  category: PostCategory.VIDEO,
                                  isShareToFeedSelected: false,
                                });
                              }}
                              disabled={!isEnabled || isLoading}
                            />
                            <span className="text-sm">Reel only</span>
                          </label>

                          {/* Reel + Feed */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`instagramType-${config.credentialId || config.platform}`}
                              className="h-4 w-4 accent-primary"
                              checked={
                                config.category === PostCategory.VIDEO &&
                                config.isShareToFeedSelected === true
                              }
                              onChange={() => {
                                if (!isEnabled) {
                                  return;
                                }

                                updatePlatformConfig(config.credentialId, {
                                  category: PostCategory.VIDEO,
                                  isShareToFeedSelected: true,
                                });
                              }}
                              disabled={!isEnabled || isLoading}
                            />
                            <span className="text-sm">Reel + Feed</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {!isTwitter && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">Title</label>
                          <Button
                            variant={ButtonVariant.GHOST}
                            size={ButtonSize.XS}
                            className="gap-2"
                            onClick={() =>
                              handleGenerateContent(
                                config.credentialId,
                                config.platform,
                                'title',
                              )
                            }
                            isDisabled={
                              !isEnabled ||
                              isLoading ||
                              generatingTitleFor === config.credentialId
                            }
                            isLoading={
                              generatingTitleFor === config.credentialId
                            }
                            icon={<HiSparkles className="w-3 h-3" />}
                            label={
                              generatingTitleFor === config.credentialId
                                ? 'Generating...'
                                : 'Generate'
                            }
                          />
                        </div>
                        <Input
                          type="text"
                          value={config.label}
                          onChange={(event) => {
                            if (!isEnabled) {
                              return;
                            }

                            updatePlatformConfig(config.credentialId, {
                              label: event.target.value,
                            });
                          }}
                          placeholder={globalLabel || 'Enter title'}
                          disabled={!isEnabled || isLoading}
                        />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium">
                          {isTwitter ? 'Tweet' : 'Description'}
                        </label>
                        <Button
                          variant={ButtonVariant.GHOST}
                          size={ButtonSize.XS}
                          className="gap-2"
                          onClick={() =>
                            handleGenerateContent(
                              config.credentialId,
                              config.platform,
                              'description',
                            )
                          }
                          isDisabled={
                            !isEnabled ||
                            isLoading ||
                            generatingDescFor === config.credentialId
                          }
                          isLoading={generatingDescFor === config.credentialId}
                          icon={<HiSparkles className="w-3 h-3" />}
                          label={
                            generatingDescFor === config.credentialId
                              ? 'Generating...'
                              : 'Generate'
                          }
                        />
                      </div>

                      <Textarea
                        className={isTwitter ? 'h-20' : 'h-24'}
                        value={config.description}
                        onChange={(event) => {
                          if (!isEnabled) {
                            return;
                          }

                          updatePlatformConfig(config.credentialId, {
                            description: event.target.value,
                          });
                        }}
                        placeholder={
                          isTwitter
                            ? "What's happening?"
                            : globalDescription || 'Enter description'
                        }
                        disabled={!isEnabled || isLoading}
                      />

                      {isTwitter && (
                        <p className="text-xs text-foreground/70 mt-1">
                          {280 - currentLength} characters remaining
                        </p>
                      )}
                    </div>

                    <Checkbox
                      name={`override-${config.platform}`}
                      label="Override schedule time"
                      className="checkbox-xs"
                      isChecked={config.overrideSchedule}
                      onChange={(event) => {
                        if (!isEnabled) {
                          return;
                        }

                        updatePlatformConfig(config.credentialId, {
                          customScheduledDate: event.target.checked
                            ? config.customScheduledDate
                            : '',
                          overrideSchedule: event.target.checked,
                        });
                      }}
                      isDisabled={!isEnabled || isLoading}
                    />

                    {config.overrideSchedule && (
                      <Input
                        type="datetime-local"
                        value={config.customScheduledDate}
                        onChange={(event) => {
                          if (!isEnabled) {
                            return;
                          }

                          updatePlatformConfig(config.credentialId, {
                            customScheduledDate: event.target.value,
                          });
                        }}
                        min={getMinDateTime().toISOString().slice(0, 16)}
                        disabled={!isEnabled || isLoading}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </>
  );
}
