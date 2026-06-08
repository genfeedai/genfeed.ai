'use client';

import { CredentialPlatform } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import type { ModalPostPlatformsTabProps } from '@genfeedai/props/modals/modal.props';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { createPromptHandler } from '@genfeedai/services/core/socket-manager.service';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ModalPostPlatformCard from './ModalPostPlatformCard';
import ModalPostPlatformGrid from './ModalPostPlatformGrid';
import {
  PLATFORM_TO_CONTENT_CATEGORY,
  PLATFORM_TO_SYSTEM_PROMPT_KEY,
  PLATFORM_TO_TITLE_CATEGORY,
} from './platform-map.constants';

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
          <div className=" border border-dashed border-white/[0.08] bg-card/40 p-6 text-sm text-foreground/70">
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
                <ModalPostPlatformCard
                  key={config.platform}
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
              );
              acc.push(node);
              return acc;
            }, [])}
          </div>
        )}
      </div>
    </>
  );
}
