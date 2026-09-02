'use client';

import { IngredientStatus } from '@genfeedai/contracts';
import type { IImage, IModel, IVideo } from '@genfeedai/contracts/interfaces';
import type {
  GenerationResponse,
  SocketResult,
} from '@genfeedai/contracts/interfaces/content/generation-payload.interface';
import type { AssetQueryService } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type {
  StudioGenerateJob,
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import {
  buildBaseGenerationPayload,
  buildImagePayload,
  buildMusicPayload,
  buildVideoPayload,
} from '@pages/studio/generate/utils/generation-payloads';
import {
  mergeStudioGenerateJobs,
  resolveJsonApiIngredientId,
  resolveStudioAssetDimensions,
  resolveStudioAssetUrl,
} from '@pages/studio/generate/utils/studio-generate-asset';
import {
  isStudioGenerateJobPending,
  recipeFromPromptData,
} from '@pages/studio/generate/utils/studio-generate-recipe';
import {
  readStudioGenerateSessionJobs,
  writeStudioGenerateSessionJobs,
} from '@pages/studio/generate/utils/studio-generate-session';
import { buildStudioPromptData } from '@pages/studio/generate/utils/studio-generate-settings';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { ImagesService } from '@services/ingredients/images.service';
import { MusicsService } from '@services/ingredients/musics.service';
import { VideosService } from '@services/ingredients/videos.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { resolvePendingIds } from '@utils/network/generation.util';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_MUSIC_DURATION = 10;

export interface UseStudioGenerationParams {
  brandId: string;
  models: readonly IModel[];
  onGenerated?: () => void;
  settings: StudioGenerateSettings;
  type: StudioGenerateType;
}

export interface UseStudioGenerationReturn {
  clearJobs: () => void;
  isGenerating: boolean;
  jobs: readonly StudioGenerateJob[];
  rehydratePending: (jobs: readonly StudioGenerateJob[]) => void;
  removeJob: (id: string) => void;
  submit: (
    promptText: string,
    references?: StudioGenerationReferences,
  ) => Promise<void>;
}

export interface StudioGenerationReferences {
  endFrameId?: string;
  imageReferenceIds?: string[];
  videoReferenceIds?: string[];
}

/**
 * Resolves the model key actually sent to the API. Auto routing and avatar
 * both let the backend pick, so they submit an empty key.
 */
export function resolveModelKey(
  settings: StudioGenerateSettings,
  models: readonly IModel[],
  hasModelSelection: boolean,
): string {
  if (!hasModelSelection || settings.modelKey === AUTO_MODEL_OPTION_VALUE) {
    return '';
  }

  if (models.some((model) => model.key === settings.modelKey)) {
    return settings.modelKey;
  }

  return models[0]?.key ?? '';
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useStudioGeneration({
  brandId,
  models,
  onGenerated,
  settings,
  type,
}: UseStudioGenerationParams): UseStudioGenerationReturn {
  const { subscribe } = useSocketManager();
  const [jobs, setJobs] = useState<readonly StudioGenerateJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const subscriptionsRef = useRef<Array<() => void>>([]);
  const subscribedIdsRef = useRef(new Set<string>());
  const restoredBrandRef = useRef<string | null>(null);
  const onGeneratedRef = useRef(onGenerated);

  useEffect(() => {
    onGeneratedRef.current = onGenerated;
  }, [onGenerated]);

  useEffect(
    () => () => {
      for (const unsubscribe of subscriptionsRef.current) {
        unsubscribe();
      }
      subscriptionsRef.current = [];
      subscribedIdsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!brandId || restoredBrandRef.current !== brandId) {
      return;
    }
    writeStudioGenerateSessionJobs(brandId, jobs);
  }, [brandId, jobs]);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const getMusicsService = useAuthedService((token: string) =>
    MusicsService.getInstance(token),
  );
  const getVoicesService = useAuthedService((token: string) =>
    VoicesService.getInstance(token),
  );
  const getHeyGenService = useAuthedService((token: string) =>
    HeyGenService.getInstance(token),
  );
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const patchJob = useCallback(
    (id: string, patch: Partial<StudioGenerateJob>) => {
      setJobs((previous) =>
        previous.map((job) => (job.id === id ? { ...job, ...patch } : job)),
      );
    },
    [],
  );

  const clearJobs = useCallback(() => {
    setJobs([]);
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs((previous) => previous.filter((job) => job.id !== id));
  }, []);

  const resolveFetchService = useCallback(
    async (jobType: StudioGenerateType): Promise<AssetQueryService> => {
      switch (jobType) {
        case 'image':
          return await getImagesService();
        case 'video':
        // An avatar clip is stored as a video ingredient.
        case 'avatar':
          return await getVideosService();
        case 'music':
          return await getMusicsService();
        default:
          return await getIngredientsService();
      }
    },
    [
      getImagesService,
      getIngredientsService,
      getMusicsService,
      getVideosService,
    ],
  );

  const subscribeToPendingJob = useCallback(
    (pendingId: string, jobType: StudioGenerateType) => {
      if (subscribedIdsRef.current.has(pendingId)) {
        return;
      }

      const config = getStudioGenerateTypeConfig(jobType);
      // Socket topics are the lowercase plural of the ingredient category —
      // `categoryToPlural()` on the server. Never derive this from the
      // SCREAMING enum member.
      const topic = `/${config.resourceSegment}/${pendingId}`;
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        subscribedIdsRef.current.delete(pendingId);
        if (!unsubscribe) {
          return;
        }
        unsubscribe();
        subscriptionsRef.current = subscriptionsRef.current.filter(
          (entry) => entry !== unsubscribe,
        );
        unsubscribe = null;
      };

      const handler = createMediaHandler<SocketResult>(
        async (result) => {
          const resolvedId =
            typeof result === 'string'
              ? result
              : typeof result.id === 'string'
                ? result.id
                : pendingId;

          try {
            const fetchService = await resolveFetchService(jobType);
            const ingredient = await fetchService.findOne(resolvedId);
            const dimensions = resolveStudioAssetDimensions(ingredient);

            patchJob(pendingId, {
              ...(dimensions.height ? { height: dimensions.height } : {}),
              ingredient: ingredient ?? undefined,
              ingredientId: String(ingredient?.id ?? resolvedId),
              status: IngredientStatus.GENERATED,
              url: resolveStudioAssetUrl(ingredient),
              ...(dimensions.width ? { width: dimensions.width } : {}),
            });
            onGeneratedRef.current?.();
          } catch (error) {
            logger.error(
              'Failed to load Studio generation result after socket event',
              error,
            );
            // The asset may well exist, but we could not read it — showing a
            // finished card with no media would be a lie. Fail it loudly and
            // let the gallery refresh surface the row if it did land.
            patchJob(pendingId, {
              error: 'Generation finished but the asset could not be loaded',
              status: IngredientStatus.FAILED,
            });
            onGeneratedRef.current?.();
          } finally {
            cleanup();
          }
        },
        (errorMessage: string) => {
          const message = errorMessage || `${config.label} generation failed`;
          patchJob(pendingId, {
            error: message,
            status: IngredientStatus.FAILED,
          });
          notificationsService.error(message);
          cleanup();
        },
      );

      subscribedIdsRef.current.add(pendingId);
      unsubscribe = subscribe(topic, handler);
      subscriptionsRef.current.push(unsubscribe);
    },
    [notificationsService, patchJob, resolveFetchService, subscribe],
  );

  const trackPendingIds = useCallback(
    (
      pendingIds: string[],
      context: {
        height?: number;
        modelKey: string;
        promptText: string;
        recipe?: StudioGenerateJob['recipe'];
        runId: string;
        type: StudioGenerateType;
        width?: number;
      },
    ) => {
      setJobs((previous) => [
        ...pendingIds.map((id) => ({
          createdAt: Date.now(),
          height: context.height,
          id,
          ingredientId: id,
          modelKey: context.modelKey || undefined,
          prompt: context.promptText,
          recipe: context.recipe,
          runId: context.runId,
          status: IngredientStatus.PROCESSING,
          type: context.type,
          width: context.width,
        })),
        ...previous,
      ]);

      for (const pendingId of pendingIds) {
        subscribeToPendingJob(pendingId, context.type);
      }
    },
    [subscribeToPendingJob],
  );

  const rehydratePending = useCallback(
    (candidates: readonly StudioGenerateJob[]) => {
      const pending = candidates.filter((job) =>
        isStudioGenerateJobPending(job.status),
      );

      if (pending.length === 0) {
        return;
      }

      setJobs((previous) => mergeStudioGenerateJobs(previous, pending));

      for (const job of pending) {
        subscribeToPendingJob(job.id, job.type);
      }
    },
    [subscribeToPendingJob],
  );

  useEffect(() => {
    if (!brandId || restoredBrandRef.current === brandId) {
      return;
    }

    restoredBrandRef.current = brandId;
    const restored = readStudioGenerateSessionJobs(brandId);

    if (restored.length === 0) {
      return;
    }

    setJobs((previous) => mergeStudioGenerateJobs(previous, restored));

    for (const job of restored) {
      if (isStudioGenerateJobPending(job.status)) {
        subscribeToPendingJob(job.id, job.type);
      }
    }
  }, [brandId, subscribeToPendingJob]);

  const submit = useCallback(
    async (promptText: string, references: StudioGenerationReferences = {}) => {
      if (isGenerating) {
        return;
      }

      if (!brandId) {
        notificationsService.error('Please set up a brand before generating');
        return;
      }

      const config = getStudioGenerateTypeConfig(type);
      const promptData = buildStudioPromptData({
        brandId,
        promptText,
        references: references.imageReferenceIds ?? [],
        settings,
        type,
      });

      if (!promptData.isValid) {
        notificationsService.error(
          config.capabilities.hasSpeech && !promptText.trim()
            ? 'A prompt or a script is required'
            : 'Prompt is required',
        );
        return;
      }

      const modelKey = resolveModelKey(
        settings,
        models,
        config.capabilities.hasModelSelection,
      );
      const jobDimensions = config.capabilities.hasAspectRatio
        ? { height: promptData.height, width: promptData.width }
        : {};
      const runId = crypto.randomUUID();
      const recipe = recipeFromPromptData(promptData, type, settings);
      const pendingContext = {
        ...jobDimensions,
        modelKey,
        promptText,
        recipe,
        runId,
        type,
      };

      setIsGenerating(true);

      try {
        switch (type) {
          case 'image': {
            const service = await getImagesService();
            const payload = buildImagePayload(
              buildBaseGenerationPayload(promptData, modelKey, brandId),
              promptData,
            );
            const data = (await service.post({
              ...payload,
              blacklist: settings.blacklist,
            } as unknown as Partial<IImage>)) as GenerationResponse;
            trackPendingIds(resolvePendingIds(data), pendingContext);
            break;
          }

          case 'video': {
            const service = await getVideosService();
            const videoPromptData = {
              ...promptData,
              endFrame: references.endFrameId,
              videoReferences: references.videoReferenceIds,
            };
            const payload = buildVideoPayload(
              buildBaseGenerationPayload(videoPromptData, modelKey, brandId),
              videoPromptData,
            );
            const data = (await service.post({
              ...payload,
              blacklist: settings.blacklist,
            } as unknown as Partial<IVideo>)) as GenerationResponse;
            trackPendingIds(resolvePendingIds(data), pendingContext);
            break;
          }

          case 'music': {
            const service = await getMusicsService();
            const payload = buildMusicPayload(
              promptData,
              modelKey,
              settings.duration ?? DEFAULT_MUSIC_DURATION,
            );
            const data = (await service.post(
              payload as Parameters<MusicsService['post']>[0],
            )) as GenerationResponse;
            trackPendingIds(resolvePendingIds(data), pendingContext);
            break;
          }

          case 'avatar': {
            if (!settings.avatarPhotoUrl) {
              notificationsService.error('Pick an avatar before generating');
              break;
            }

            const service = await getHeyGenService();
            // `avatarId` on this endpoint means a HeyGen catalog id. Genfeed
            // portraits are our own ingredients, so they travel as `photoUrl`.
            const data = await service.generate({
              photoUrl: settings.avatarPhotoUrl,
              text: promptData.speech?.trim() || promptData.text?.trim() || '',
              voiceId: settings.voiceId,
            });
            trackPendingIds([resolveJsonApiIngredientId(data)], pendingContext);
            break;
          }

          case 'voice': {
            if (!settings.voiceId) {
              notificationsService.error('Pick a voice before generating');
              break;
            }

            const service = await getVoicesService();
            // Text-to-speech runs inline on the API and returns the finished
            // ingredient, so there is no socket phase to wait on.
            const voice = await service.generate({
              speed: 1,
              text: promptData.speech?.trim() || promptText.trim(),
              voiceId: settings.voiceId,
            });

            setJobs((previous) => [
              {
                createdAt: Date.now(),
                id: String(voice.id),
                ingredient: voice,
                ingredientId: String(voice.id),
                modelKey: modelKey || undefined,
                prompt: promptText,
                recipe,
                runId,
                status: IngredientStatus.GENERATED,
                type,
                url: resolveStudioAssetUrl(voice),
              },
              ...previous,
            ]);
            onGeneratedRef.current?.();
            break;
          }

          default:
            logger.error(`Unsupported Studio generation type: ${type}`);
        }
      } catch (error) {
        logger.error('Studio generation failed', error);
        const message = toErrorMessage(
          error,
          `Failed to generate ${config.label}`,
        );

        // A toast disappears. Leave a failed card so the operator can see what
        // died and reprompt it without retyping.
        setJobs((previous) => [
          {
            createdAt: Date.now(),
            error: message,
            ...jobDimensions,
            id: `failed-${crypto.randomUUID()}`,
            modelKey: modelKey || undefined,
            prompt: promptText,
            recipe,
            runId,
            status: IngredientStatus.FAILED,
            type,
          },
          ...previous,
        ]);
        notificationsService.error(message);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      brandId,
      getHeyGenService,
      getImagesService,
      getMusicsService,
      getVideosService,
      getVoicesService,
      isGenerating,
      models,
      notificationsService,
      settings,
      trackPendingIds,
      type,
    ],
  );

  return {
    clearJobs,
    isGenerating,
    jobs,
    rehydratePending,
    removeJob,
    submit,
  };
}
