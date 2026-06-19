'use client';

import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import { IngredientFormat } from '@genfeedai/enums';
import type {
  FastlaneAssetItem,
  FastlaneIdea,
  IImage,
  IVideo,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import {
  buildAvatarPayload,
  buildBaseGenerationPayload,
  buildImagePayload,
  buildVideoPayload,
} from '@pages/studio/generate/utils/generation-payloads';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import { resolvePendingIds } from '@utils/network/generation.util';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FastlaneAssetUpdate,
  UseFastlaneGenerationParams,
  UseFastlaneGenerationReturn,
} from '../types';

// Credit-weight constants (visible in idea selector)
export const FASTLANE_CREDIT_COSTS: Record<string, number> = {
  image: 2,
  video: 5,
  avatar: 8,
};

type SocketResult = { id?: string } | string;

function buildPromptData(
  idea: FastlaneIdea,
  brandId: string,
  avatarIngredientId?: string | null,
  voiceId?: string | null,
  references?: string[],
): PromptTextareaSchema & { isValid: boolean } {
  const baseText = (
    idea.visualPrompt?.trim() ||
    idea.hook?.trim() ||
    ''
  ).trim();
  const text = baseText.length > 0 ? baseText : idea.caption;

  const base: PromptTextareaSchema & { isValid: boolean } = {
    autoSelectModel: true,
    blacklist: [],
    brand: brandId,
    category: idea.format,
    fontFamily: '',
    format: IngredientFormat.PORTRAIT,
    height: 1920,
    isValid: true,
    models: [],
    outputs: 1,
    quality: 'premium',
    references: references ?? [],
    sounds: [],
    style: '',
    tags: [],
    text,
    width: 1080,
  };

  if (idea.format === 'avatar') {
    return {
      ...base,
      avatarId: avatarIngredientId ?? undefined,
      voiceId: voiceId ?? undefined,
      speech: (idea.speechText ?? idea.caption ?? '').trim(),
      text: (idea.speechText ?? idea.caption ?? '').trim() || text,
    };
  }

  return base;
}

export function useFastlaneGeneration({
  brandId,
  avatarIngredientId,
  voiceId,
  references,
}: UseFastlaneGenerationParams): UseFastlaneGenerationReturn {
  const [assets, setAssets] = useState<FastlaneAssetItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const socketSubscriptionsRef = useRef<Array<() => void>>([]);

  const { subscribe } = useSocketManager();
  const notificationsService = NotificationsService.getInstance();

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const getHeyGenService = useAuthedService((token: string) =>
    HeyGenService.getInstance(token),
  );
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  // Cleanup all WS subscriptions on unmount
  useEffect(() => {
    return () => {
      for (const unsub of socketSubscriptionsRef.current) {
        try {
          unsub();
        } catch {
          // ignore cleanup errors
        }
      }
      socketSubscriptionsRef.current = [];
    };
  }, []);

  const updateAsset = useCallback(
    (ideaId: string, update: FastlaneAssetUpdate) => {
      setAssets((prev) =>
        prev.map((a) => (a.idea.id === ideaId ? { ...a, ...update } : a)),
      );
    },
    [],
  );

  const subscribeToAsset = useCallback(
    (idea: FastlaneIdea, pendingId: string) => {
      const url = `/${idea.format}s/${pendingId}`;
      let unsubscribe: (() => void) | null = null;

      const cleanupSubscription = () => {
        if (unsubscribe) {
          unsubscribe();
          socketSubscriptionsRef.current =
            socketSubscriptionsRef.current.filter((fn) => fn !== unsubscribe);
          unsubscribe = null;
        }
      };

      const handler = createMediaHandler<SocketResult>(
        async (result) => {
          const resolvedId =
            typeof result === 'string'
              ? result
              : typeof result?.id === 'string'
                ? result.id
                : pendingId;

          try {
            let ingredientUrl: string | undefined;
            let thumbnailUrl: string | undefined;

            if (idea.format === 'video') {
              const service = await getVideosService();
              const ingredient = await service.findOne(resolvedId);
              ingredientUrl = (ingredient as { url?: string }).url;
              thumbnailUrl = (ingredient as { thumbnailUrl?: string })
                .thumbnailUrl;
            } else if (idea.format === 'image') {
              const service = await getImagesService();
              const ingredient = await service.findOne(resolvedId);
              ingredientUrl = (ingredient as { url?: string }).url;
              thumbnailUrl = (ingredient as { thumbnailUrl?: string })
                .thumbnailUrl;
            } else {
              // avatar — use IngredientsService
              const service = await getIngredientsService();
              const ingredient = await service.findOne(resolvedId);
              ingredientUrl = (ingredient as { url?: string }).url;
              thumbnailUrl = (ingredient as { thumbnailUrl?: string })
                .thumbnailUrl;
            }

            updateAsset(idea.id, {
              status: 'ready',
              ingredientId: resolvedId,
              ingredientUrl,
              thumbnailUrl,
            });
          } catch (err) {
            logger.error(
              'Fastlane: failed to fetch ingredient after WS event',
              err,
            );
            updateAsset(idea.id, {
              status: 'failed',
              errorMessage: 'Failed to load generated asset',
            });
          } finally {
            cleanupSubscription();
          }
        },
        (errorMessage: string) => {
          updateAsset(idea.id, {
            status: 'failed',
            errorMessage: errorMessage || `${idea.format} generation failed`,
          });
          notificationsService.error(
            errorMessage || `${idea.format} generation failed`,
          );
          cleanupSubscription();
        },
      );

      unsubscribe = subscribe(url, handler);
      // unsubscribe is non-null here since subscribe() always returns a function
      socketSubscriptionsRef.current.push(unsubscribe as () => void);
    },
    [
      getImagesService,
      getVideosService,
      getIngredientsService,
      notificationsService,
      subscribe,
      updateAsset,
    ],
  );

  const dispatchIdea = useCallback(
    async (idea: FastlaneIdea): Promise<void> => {
      const promptData = buildPromptData(
        idea,
        brandId,
        avatarIngredientId,
        voiceId,
        references,
      );

      let response: unknown;

      try {
        if (idea.format === 'image') {
          const service = await getImagesService();
          const base = buildBaseGenerationPayload(promptData, '', brandId);
          const imagePayload = buildImagePayload(base, promptData);
          // Mirror useSocketGeneration: re-apply blacklist as string[] and cast
          const servicePayload = {
            ...imagePayload,
            blacklist: promptData.blacklist || [],
          };
          response = await service.post(
            servicePayload as unknown as Partial<IImage>,
          );
        } else if (idea.format === 'video') {
          const service = await getVideosService();
          const base = buildBaseGenerationPayload(promptData, '', brandId);
          const videoPayload = buildVideoPayload(base, promptData);
          const servicePayload = {
            ...videoPayload,
            blacklist: promptData.blacklist || [],
          };
          response = await service.post(
            servicePayload as unknown as Partial<IVideo>,
          );
        } else {
          // avatar
          const service = await getHeyGenService();
          const payload = buildAvatarPayload(promptData);
          response = await service.generate(payload);
        }
      } catch (err) {
        logger.error('Fastlane: dispatch failed for idea', {
          ideaId: idea.id,
          err,
        });
        updateAsset(idea.id, {
          status: 'failed',
          errorMessage:
            err instanceof Error ? err.message : 'Generation request failed',
        });
        return;
      }

      let pendingIds: string[];
      try {
        pendingIds = resolvePendingIds(response);
      } catch {
        updateAsset(idea.id, {
          status: 'failed',
          errorMessage: 'No pending ID returned from generation service',
        });
        return;
      }

      // Subscribe to all pending IDs (usually 1, but batch is possible)
      for (const pendingId of pendingIds) {
        subscribeToAsset(idea, pendingId);
      }
    },
    [
      brandId,
      avatarIngredientId,
      voiceId,
      references,
      getImagesService,
      getVideosService,
      getHeyGenService,
      updateAsset,
      subscribeToAsset,
    ],
  );

  const startGeneration = useCallback(
    async (ideas: FastlaneIdea[]): Promise<void> => {
      // Initialize all assets as generating
      const initial: FastlaneAssetItem[] = ideas.map((idea) => ({
        idea,
        ingredientId: null,
        status: 'generating',
      }));
      setAssets(initial);
      setIsGenerating(true);

      await Promise.allSettled(ideas.map((idea) => dispatchIdea(idea)));

      setIsGenerating(false);
    },
    [dispatchIdea],
  );

  const failedCount = assets.filter((a) => a.status === 'failed').length;
  const readyCount = assets.filter((a) => a.status === 'ready').length;

  return { assets, isGenerating, startGeneration, failedCount, readyCount };
}
