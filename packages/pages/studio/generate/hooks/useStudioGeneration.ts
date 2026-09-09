'use client';

import { IngredientStatus } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
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
  cancelJob: (job: StudioGenerateJob) => Promise<void>;
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
  const { subscribe, connectionState } = useSocketManager();
  const activeBrandRef = useRef(brandId);
  activeBrandRef.current = brandId;
  const submittingRef = useRef(false);
  const cancellingIds = useRef(new Set<string>());
  const [jobs, setJobs] = useState<readonly StudioGenerateJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobsBrandId, setJobsBrandId] = useState(brandId);

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
    if (
      !brandId ||
      jobsBrandId !== brandId ||
      restoredBrandRef.current !== brandId
    ) {
      return;
    }
    writeStudioGenerateSessionJobs(brandId, jobs);
  }, [brandId, jobs, jobsBrandId]);

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
        previous.map((job) =>
          job.id === id && isStudioGenerateJobPending(job.status)
            ? { ...job, ...patch }
            : job,
        ),
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
          if (activeBrandRef.current !== brandId) return;
          const resolvedId =
            typeof result === 'string'
              ? result
              : typeof result.id === 'string'
                ? result.id
                : pendingId;

          try {
            const fetchService = await resolveFetchService(jobType);
            const ingredient = await fetchService.findOne(resolvedId);
            if (activeBrandRef.current !== brandId) return;
            if (
              !ingredient?.status ||
              isStudioGenerateJobPending(ingredient.status)
            )
              return;
            const dimensions = resolveStudioAssetDimensions(ingredient);

            patchJob(pendingId, {
              ...(dimensions.height ? { height: dimensions.height } : {}),
              ingredient: ingredient ?? undefined,
              ingredientId: String(ingredient?.id ?? resolvedId),
              phase:
                ingredient.generationError === 'Cancelled by user'
                  ? 'cancelled'
                  : undefined,
              error: ingredient.generationError ?? undefined,
              status: ingredient.status,
              url: resolveStudioAssetUrl(ingredient),
              ...(dimensions.width ? { width: dimensions.width } : {}),
            });
            onGeneratedRef.current?.();
          } catch (error) {
            logger.error(
              'Failed to load Studio generation result after socket event',
              error,
            );
            if (activeBrandRef.current !== brandId) return;
            patchJob(pendingId, {
              error: 'The result could not be loaded. Reconnecting…',
              phase: 'saving',
            });
            onGeneratedRef.current?.();
          } finally {
            cleanup();
          }
        },
        (errorMessage: string) => {
          if (activeBrandRef.current !== brandId) return;
          const message = errorMessage || `${config.label} generation failed`;
          patchJob(pendingId, {
            error: message,
            phase: message === 'Cancelled by user' ? 'cancelled' : undefined,
            status: IngredientStatus.FAILED,
          });
          if (message !== 'Cancelled by user')
            notificationsService.error(message);
          cleanup();
        },
      );

      subscribedIdsRef.current.add(pendingId);
      unsubscribe = subscribe(topic, handler);
      subscriptionsRef.current.push(unsubscribe);
    },
    [brandId, notificationsService, patchJob, resolveFetchService, subscribe],
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
      if (activeBrandRef.current !== brandId) return;
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
        ...previous.filter(
          (job) => job.runId !== context.runId || job.phase !== 'submitting',
        ),
      ]);

      for (const pendingId of pendingIds) {
        subscribeToPendingJob(pendingId, context.type);
      }
    },
    [brandId, subscribeToPendingJob],
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

    for (const unsubscribe of subscriptionsRef.current) unsubscribe();
    subscriptionsRef.current = [];
    subscribedIdsRef.current.clear();
    restoredBrandRef.current = brandId;
    const restored = readStudioGenerateSessionJobs(brandId);

    setJobs(restored);
    setJobsBrandId(brandId);

    for (const job of restored) {
      if (isStudioGenerateJobPending(job.status)) {
        subscribeToPendingJob(job.id, job.type);
      }
    }
  }, [brandId, subscribeToPendingJob]);

  const cancelJob = useCallback(
    async (job: StudioGenerateJob) => {
      if (!job.ingredientId || cancellingIds.current.has(job.id)) return;
      cancellingIds.current.add(job.id);
      try {
        const service = await getIngredientsService();
        const ingredient = await service.cancelGeneration(job.ingredientId);
        if (activeBrandRef.current !== brandId) return;
        patchJob(job.id, {
          ingredient,
          status: ingredient.status,
          phase:
            ingredient.generationError === 'Cancelled by user'
              ? 'cancelled'
              : undefined,
          error: ingredient.generationError ?? undefined,
          url: resolveStudioAssetUrl(ingredient),
        });
        onGeneratedRef.current?.();
      } catch (error) {
        if (activeBrandRef.current === brandId)
          notificationsService.error(
            toErrorMessage(error, 'Could not cancel generation'),
          );
      } finally {
        cancellingIds.current.delete(job.id);
      }
    },
    [brandId, getIngredientsService, notificationsService, patchJob],
  );

  useEffect(() => {
    const pending = jobs.filter(
      (job) => job.ingredientId && isStudioGenerateJobPending(job.status),
    );
    if (
      jobsBrandId !== brandId ||
      pending.length === 0 ||
      connectionState === 'offline'
    )
      return;
    const controller = new AbortController();
    let isRefreshing = false;
    const reconcile = async () => {
      if (isRefreshing || document.visibilityState === 'hidden') return;
      isRefreshing = true;
      try {
        for (const job of pending) {
          if (controller.signal.aborted) return;
          try {
            const service = await resolveFetchService(job.type);
            const ingredient = await service.findOne(
              job.ingredientId ?? job.id,
              undefined,
              controller.signal,
            );
            if (controller.signal.aborted || activeBrandRef.current !== brandId)
              return;
            if (
              !ingredient?.status ||
              isStudioGenerateJobPending(ingredient.status)
            )
              continue;
            const dimensions = resolveStudioAssetDimensions(ingredient);
            patchJob(job.id, {
              ingredient,
              phase:
                ingredient.generationError === 'Cancelled by user'
                  ? 'cancelled'
                  : undefined,
              error: ingredient.generationError ?? undefined,
              status: ingredient.status,
              url: resolveStudioAssetUrl(ingredient),
              ...(dimensions.height ? { height: dimensions.height } : {}),
              ...(dimensions.width ? { width: dimensions.width } : {}),
            });
            onGeneratedRef.current?.();
          } catch (error) {
            if (!controller.signal.aborted)
              logger.debug(
                'Studio generation status could not be refreshed',
                error,
              );
          }
        }
      } finally {
        isRefreshing = false;
      }
    };
    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 10000);
    const onVisible = () => void reconcile();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [
    brandId,
    connectionState,
    jobs,
    jobsBrandId,
    patchJob,
    resolveFetchService,
  ]);

  const submit = useCallback(
    async (promptText: string, references: StudioGenerationReferences = {}) => {
      if (submittingRef.current) {
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

      if (
        (type === 'avatar' && !settings.avatarPhotoUrl) ||
        ((type === 'voice' || type === 'avatar') && !settings.voiceId)
      ) {
        notificationsService.error(
          type === 'avatar' && !settings.avatarPhotoUrl
            ? 'Pick an avatar before generating'
            : 'Pick a voice before generating',
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

      submittingRef.current = true;
      setIsGenerating(true);
      setJobs((previous) => [
        ...Array.from(
          {
            length: config.capabilities.hasOutputs
              ? Math.max(1, settings.outputs)
              : 1,
          },
          (_, index) => ({
            createdAt: Date.now(),
            id: `submitting-${runId}-${index}`,
            modelKey,
            prompt: promptText,
            recipe,
            runId,
            status: IngredientStatus.PROCESSING,
            phase: 'submitting' as const,
            type,
            ...jobDimensions,
          }),
        ),
        ...previous,
      ]);

      try {
        switch (type) {
          case 'image': {
            const service = await getImagesService();
            const payload = buildImagePayload(
              buildBaseGenerationPayload(promptData, modelKey, brandId),
              promptData,
            );
            const data = (await service.post(payload)) as GenerationResponse;
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
            const data = (await service.post(payload)) as GenerationResponse;
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

            if (activeBrandRef.current !== brandId) return;
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
              ...previous.filter((job) => job.runId !== runId),
            ]);
            onGeneratedRef.current?.();
            break;
          }

          default:
            logger.error(`Unsupported Studio generation type: ${type}`);
        }
      } catch (error) {
        if (activeBrandRef.current !== brandId) return;
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
          ...previous.filter((job) => job.runId !== runId),
        ]);
        notificationsService.error(message);
      } finally {
        submittingRef.current = false;
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
      models,
      notificationsService,
      settings,
      trackPendingIds,
      type,
    ],
  );

  return {
    cancelJob,
    clearJobs,
    isGenerating,
    jobs: jobsBrandId === brandId ? jobs : [],
    rehydratePending,
    removeJob,
    submit,
  };
}
