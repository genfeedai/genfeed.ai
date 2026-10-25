'use client';

import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  FLUX_3_EDIT_CONTRACT_VERSION,
  getImageEditMaxSources,
  getModelMaxAudioReferences,
  hasAudioReferences,
  IMAGE_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_QUALITY,
  isFlux3ImageModel,
  isImageEditModel,
  LIBRARY_ASSETS_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import type {
  GenerationPromptAuthor,
  IModel,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type {
  CrunGenerationQuoteResponse,
  CrunImageQuoteRequest,
  CrunVideoQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type {
  GenerationResponse,
  SocketResult,
} from '@genfeedai/contracts/interfaces/content/generation-payload.interface';
import type { AssetQueryService } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { requestTopbarBalancesRefresh } from '@hooks/data/billing/use-topbar-balances/request-topbar-balances-refresh';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type {
  StudioPlaygroundJob,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@pages/studio/playground/types';
import {
  buildBaseGenerationPayload,
  buildImagePayload,
  buildMusicPayload,
  buildVideoPayload,
} from '@pages/studio/playground/utils/generation-payloads';
import {
  buildStudioAvatarRequest,
  resolveStudioAvatarScript,
} from '@pages/studio/playground/utils/studio-avatar-request';
import {
  hasStudioAvatarSelection,
  hasStudioVoiceSelection,
} from '@pages/studio/playground/utils/studio-identity-selection';
import { pinStudioSettingsToModel } from '@pages/studio/playground/utils/studio-pinned-model';
import {
  mergeStudioPlaygroundJobs,
  resolveJsonApiIngredientId,
  resolveStudioAssetDimensions,
  resolveStudioAssetUrl,
  toStudioPlaygroundJob,
} from '@pages/studio/playground/utils/studio-playground-asset';
import {
  isStudioPlaygroundJobPending,
  recipeFromPromptData,
} from '@pages/studio/playground/utils/studio-playground-recipe';
import {
  readStudioPlaygroundSessionJobs,
  writeStudioPlaygroundSessionJobs,
} from '@pages/studio/playground/utils/studio-playground-session';
import {
  buildStudioPromptData,
  resolveModelKey,
} from '@pages/studio/playground/utils/studio-playground-settings';
import { getStudioPlaygroundTypeConfig } from '@pages/studio/playground/utils/studio-playground-types';
import { readStudioReferencePreviewUrl } from '@pages/studio/playground/utils/studio-reference-preview';
import { buildVideoDraftSettings } from '@pages/studio/playground/utils/studio-video-draft';
import {
  resolveSpeakingVoiceProvider,
  resolveSpeechVoiceProvider,
} from '@pages/studio/playground/utils/studio-voice-selection';
import { IngredientsService } from '@services/content/ingredients.service';
import { getPersistedVideoIngredientIds } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { ImagesService } from '@services/ingredients/images.service';
import { MusicsService } from '@services/ingredients/musics.service';
import { VideosService } from '@services/ingredients/videos.service';
import { VoicesService } from '@services/ingredients/voices.service';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { getErrorStatus } from '@utils/error/json-api-status.util';
import { resolvePendingIds } from '@utils/network/generation.util';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseStudioGenerationParams {
  brandId: string;
  models: readonly IModel[];
  onGenerated?: () => void;
  settings: StudioPlaygroundSettings;
  type: StudioPlaygroundType;
}

export interface UseStudioGenerationReturn {
  cancelJob: (job: StudioPlaygroundJob) => Promise<void>;
  clearJobs: () => void;
  jobs: readonly StudioPlaygroundJob[];
  rehydratePending: (jobs: readonly StudioPlaygroundJob[]) => void;
  removeJob: (id: string) => void;
  /** Resolves `true` once the provider accepted the request. */
  submit: (
    promptText: string,
    references?: StudioGenerationReferences,
    options?: StudioGenerationOptions,
  ) => Promise<boolean>;
}

export interface StudioGenerationOptions {
  originalText?: string;
  crunRequest?: CrunImageQuoteRequest;
  crunVideoRequest?: CrunVideoQuoteRequest;
  getCurrentCrunQuote?: () => Extract<
    CrunGenerationQuoteResponse,
    { isAvailable: true }
  > | null;
  requestedSkillSlugs?: string[];
  harness?: boolean;
  /**
   * Composer reference painted on the card until the result arrives.
   * Not sent to the provider.
   */
  referencePreviewUrl?: string;
  /** Explicit Knowledge pick from the Library picker; absent means Auto. */
  knowledge?: KnowledgeSelection;
  promptId?: string;
  /** Set only when the prompt came from an agent proposal. */
  promptAuthor?: GenerationPromptAuthor;
  /** The model an Auto choice was priced at; submitted instead of routing again. */
  pinnedModelKey?: string;
  /** Submit the video's cheap draft settings instead of the real ones. */
  isDraft?: boolean;
}

export interface StudioGenerationReferences {
  audioReferenceIds?: string[];
  editSourceIds?: string[];
  editMaskId?: string;
  endFrameId?: string;
  imageReferenceIds?: string[];
  videoReferenceIds?: string[];
}

const CONFIRMED_MODEL_UNAVAILABLE_ERROR = 'STUDIO_CONFIRMED_MODEL_UNAVAILABLE';

/** Cancel is a single API call; past this it reports instead of hanging. */
const CANCEL_TIMEOUT_MS = 30_000;
const CANCEL_TIMEOUT_MESSAGE =
  'Cancelling took too long. Check your connection and try again.';
const CANCEL_UNCONFIRMED_MESSAGE =
  'The provider has not confirmed the cancellation yet. The generation and its credits stay held until it settles.';

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
  const translateCrun = useTranslations('pages.studioPlayground.crun');
  const translateSpend = useTranslations('pages.studioPlayground.spend');
  const { subscribe, connectionState } = useSocketManager();
  const modelsRef = useRef(models);
  modelsRef.current = models;
  const activeBrandRef = useRef(brandId);
  activeBrandRef.current = brandId;
  const consumedCrunQuoteRef = useRef<string | null>(null);
  const cancellingJobs = useRef(new Map<string, Promise<void>>());
  const failedHydrationIdsRef = useRef(new Set<string>());
  const [jobs, setJobs] = useState<readonly StudioPlaygroundJob[]>([]);
  const [jobsBrandId, setJobsBrandId] = useState(brandId);

  const subscriptionsRef = useRef<Array<() => void>>([]);
  const subscribedIdsRef = useRef(new Set<string>());
  const restoredBrandRef = useRef<string | null>(null);
  const onGeneratedRef = useRef(onGenerated);

  useEffect(() => {
    onGeneratedRef.current = onGenerated;
  }, [onGenerated]);

  // A reserve, settle or release moves the wallet, so every result also asks
  // the balance chip to re-read instead of waiting on the socket event.
  const notifyGenerated = useCallback(() => {
    requestTopbarBalancesRefresh();
    onGeneratedRef.current?.();
  }, []);

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
    writeStudioPlaygroundSessionJobs(brandId, jobs);
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
    (id: string, patch: Partial<StudioPlaygroundJob>) => {
      setJobs((previous) =>
        previous.map((job) =>
          job.id === id && isStudioPlaygroundJobPending(job.status)
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
    async (
      jobType: StudioPlaygroundType,
      category?: IngredientCategory,
    ): Promise<AssetQueryService> => {
      // A GIF renders as an image card, but `/images/:id` only serves images.
      if (category === IngredientCategory.GIF) {
        return await getIngredientsService();
      }
      switch (jobType) {
        case 'image-edit':
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
    (pendingId: string, jobType: StudioPlaygroundType) => {
      if (subscribedIdsRef.current.has(pendingId)) {
        return;
      }

      const config = getStudioPlaygroundTypeConfig(jobType);
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
              isStudioPlaygroundJobPending(ingredient.status)
            )
              return;
            const dimensions = resolveStudioAssetDimensions(ingredient);
            const hydrated = ingredient.imageEdit
              ? toStudioPlaygroundJob(ingredient)
              : null;
            patchJob(pendingId, {
              ...(hydrated?.modelKey ? { modelKey: hydrated.modelKey } : {}),
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
            if (ingredient.status === IngredientStatus.FAILED) {
              window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
            }
            notifyGenerated();
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
            notifyGenerated();
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
          window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
          if (message !== 'Cancelled by user')
            notificationsService.error(message);
          notifyGenerated();
          cleanup();
        },
      );

      subscribedIdsRef.current.add(pendingId);
      unsubscribe = subscribe(topic, handler);
      subscriptionsRef.current.push(unsubscribe);
    },
    [
      brandId,
      notificationsService,
      patchJob,
      resolveFetchService,
      subscribe,
      notifyGenerated,
    ],
  );

  const trackPendingIds = useCallback(
    (
      pendingIds: string[],
      context: {
        height?: number;
        modelKey: string;
        promptText: string;
        recipe?: StudioPlaygroundJob['recipe'];
        referencePreviewUrl?: string;
        runId: string;
        type: StudioPlaygroundType;
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
          ...(context.referencePreviewUrl
            ? { referencePreviewUrl: context.referencePreviewUrl }
            : {}),
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
    (candidates: readonly StudioPlaygroundJob[]) => {
      const pending = candidates.filter((job) =>
        isStudioPlaygroundJobPending(job.status),
      );

      if (pending.length === 0) {
        return;
      }

      setJobs((previous) => mergeStudioPlaygroundJobs(previous, pending));

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
    failedHydrationIdsRef.current.clear();
    restoredBrandRef.current = brandId;
    const restored = readStudioPlaygroundSessionJobs(brandId);

    setJobs(restored);
    setJobsBrandId(brandId);

    for (const job of restored) {
      if (isStudioPlaygroundJobPending(job.status)) {
        subscribeToPendingJob(job.id, job.type);
      }
    }
  }, [brandId, subscribeToPendingJob]);

  const cancelJob = useCallback(
    (job: StudioPlaygroundJob): Promise<void> => {
      // A second click joins the request already in flight instead of
      // vanishing, so Cancel always ends in a visible result.
      const inFlight = cancellingJobs.current.get(job.id);
      if (inFlight) return inFlight;
      if (!job.ingredientId) {
        notificationsService.error(
          'This generation has no server record yet, so it cannot be cancelled. Refresh the page and try again.',
        );
        return Promise.resolve();
      }
      const ingredientId = job.ingredientId;
      const request = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const ingredient = await Promise.race([
            getIngredientsService().then((service) =>
              service.cancelGeneration(ingredientId),
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(CANCEL_TIMEOUT_MESSAGE)),
                CANCEL_TIMEOUT_MS,
              );
            }),
          ]);
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
          // The API answers 200 with the ingredient untouched when the
          // provider has not confirmed the cancel; its credits stay held.
          if (isStudioPlaygroundJobPending(ingredient.status))
            notificationsService.warning(CANCEL_UNCONFIRMED_MESSAGE);
          notifyGenerated();
        } catch (error) {
          if (activeBrandRef.current === brandId)
            notificationsService.error(
              toErrorMessage(error, 'Could not cancel generation'),
            );
        } finally {
          if (timer) clearTimeout(timer);
          cancellingJobs.current.delete(job.id);
        }
      })();
      cancellingJobs.current.set(job.id, request);
      return request;
    },
    [
      brandId,
      getIngredientsService,
      notificationsService,
      patchJob,
      notifyGenerated,
    ],
  );

  useEffect(() => {
    const pending = jobs.filter(
      (job) => job.ingredientId && isStudioPlaygroundJobPending(job.status),
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
            const service = await resolveFetchService(
              job.type,
              job.ingredient?.category,
            );
            const ingredient = await service.findOne(
              job.ingredientId ?? job.id,
              undefined,
              controller.signal,
            );
            if (controller.signal.aborted || activeBrandRef.current !== brandId)
              return;
            if (
              !ingredient?.status ||
              isStudioPlaygroundJobPending(ingredient.status)
            )
              continue;
            const dimensions = resolveStudioAssetDimensions(ingredient);
            const hydrated = ingredient.imageEdit
              ? toStudioPlaygroundJob(ingredient)
              : null;
            patchJob(job.id, {
              ...(hydrated?.modelKey ? { modelKey: hydrated.modelKey } : {}),
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
            if (ingredient.status === IngredientStatus.FAILED) {
              window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
            }
            notifyGenerated();
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
    notifyGenerated,
  ]);

  // A socket failure event and a session-restored card carry only the
  // persisted ingredient ID. Without the server row the card cannot classify
  // the failure, so it offered only Remove/Reprompt while Library offered
  // Retry/Replace (#6398). Read each such row once, brand-scoped, and attach
  // it only when it is still this brand's live FAILED ingredient.
  useEffect(() => {
    if (jobsBrandId !== brandId || connectionState === 'offline') return;
    const unresolved = jobs.filter(
      (job) =>
        job.status === IngredientStatus.FAILED &&
        Boolean(job.ingredientId) &&
        job.id === job.ingredientId &&
        job.ingredient?.id !== job.ingredientId &&
        !failedHydrationIdsRef.current.has(job.id),
    );
    if (unresolved.length === 0) return;
    const controller = new AbortController();
    const claimedIds = unresolved.map((job) => job.id);
    let isSettled = false;
    for (const id of claimedIds) failedHydrationIdsRef.current.add(id);
    void (async () => {
      const settled = await Promise.all(
        unresolved.map(async (job) => {
          const id = job.id;
          try {
            const service = await resolveFetchService(job.type);
            const ingredient = await service.findOne(
              id,
              { brandId },
              controller.signal,
            );
            return ingredient &&
              ingredient.id === id &&
              ingredient.brandId === brandId &&
              ingredient.status === IngredientStatus.FAILED &&
              !ingredient.isDeleted
              ? ingredient
              : null;
          } catch (error) {
            if (controller.signal.aborted) return null;
            const status = getErrorStatus(error);
            // A refused row stays local-only; a transient read may retry on
            // the next change to the job list.
            if (status === undefined || status >= 500) {
              failedHydrationIdsRef.current.delete(id);
            }
            logger.debug('Failed Studio generation could not be loaded', error);
            return null;
          }
        }),
      );
      if (controller.signal.aborted || activeBrandRef.current !== brandId)
        return;
      isSettled = true;
      const hydrated = new Map(
        settled.flatMap((ingredient) =>
          ingredient ? [[ingredient.id, ingredient] as const] : [],
        ),
      );
      if (hydrated.size === 0) return;
      setJobs((previous) =>
        previous.map((job) => {
          const ingredient = hydrated.get(job.id);
          return ingredient &&
            job.status === IngredientStatus.FAILED &&
            job.ingredientId === ingredient.id
            ? {
                ...job,
                error: job.error ?? ingredient.generationError ?? undefined,
                ingredient,
              }
            : job;
        }),
      );
    })();
    return () => {
      controller.abort();
      // Release a run abandoned before publishing so the next run repeats it.
      if (!isSettled)
        for (const id of claimedIds) failedHydrationIdsRef.current.delete(id);
    };
  }, [brandId, connectionState, jobs, jobsBrandId, resolveFetchService]);

  const submit = useCallback(
    async function submitGeneration(
      promptText: string,
      references: StudioGenerationReferences = {},
      options?: StudioGenerationOptions,
    ): Promise<boolean> {
      // An Auto choice priced before submit is pinned to the model that was
      // quoted, so the amount confirmed is the amount charged.
      const currentModels = modelsRef.current;
      const pinnedModelKey = options?.pinnedModelKey;
      const isConfirmedModelUnavailable = () =>
        Boolean(
          pinnedModelKey &&
            !modelsRef.current.some((model) => model.key === pinnedModelKey),
        );
      if (isConfirmedModelUnavailable()) {
        notificationsService.error(translateSpend('confirmedModelUnavailable'));
        return false;
      }
      const assertConfirmedModelAvailable = () => {
        if (isConfirmedModelUnavailable()) {
          throw new Error(CONFIRMED_MODEL_UNAVAILABLE_ERROR);
        }
      };
      const draftSettings =
        options?.isDraft && type === 'video'
          ? buildVideoDraftSettings(settings, currentModels)
          : null;
      if (options?.isDraft && !draftSettings) {
        notificationsService.error('A draft is not available for this model');
        return false;
      }
      const activeSettings =
        draftSettings ??
        (pinnedModelKey
          ? pinStudioSettingsToModel(settings, pinnedModelKey)
          : settings);
      const referencePreviewUrl = readStudioReferencePreviewUrl(
        options?.referencePreviewUrl,
      );

      if (!brandId) {
        notificationsService.error('Please set up a brand before generating');
        return false;
      }

      const config = getStudioPlaygroundTypeConfig(type);
      const promptData = buildStudioPromptData({
        brandId,
        promptText,
        references: references.imageReferenceIds ?? [],
        settings: activeSettings,
        type,
      });

      if (!promptData.isValid) {
        notificationsService.error(
          config.capabilities.hasSpeech && !promptText.trim()
            ? 'A prompt or a script is required'
            : 'Prompt is required',
        );
        return false;
      }

      if (
        type === 'voice' &&
        (!activeSettings.voiceId ||
          !resolveSpeechVoiceProvider(activeSettings.voiceRef))
      ) {
        notificationsService.error('Pick a voice before generating');
        return false;
      }

      if (
        type === 'avatar' &&
        (!hasStudioAvatarSelection(activeSettings) ||
          !hasStudioVoiceSelection(activeSettings))
      ) {
        notificationsService.error(
          'Pick an avatar and a voice before generating',
        );
        return false;
      }

      if (
        type === 'image-edit' &&
        (!references.editSourceIds?.length ||
          (activeSettings.modelKey !== AUTO_MODEL_OPTION_VALUE &&
            (!isImageEditModel(activeSettings.modelKey) ||
              !currentModels.some(
                (model) => model.key === activeSettings.modelKey,
              ))))
      ) {
        notificationsService.error(
          'Choose a source image and an available editing model.',
        );
        return false;
      }
      const modelKey = resolveModelKey(
        activeSettings,
        currentModels,
        config.capabilities.hasModelSelection,
      );
      if (
        references.audioReferenceIds?.length &&
        (type !== 'video' ||
          !hasAudioReferences(modelKey) ||
          references.audioReferenceIds.length >
            getModelMaxAudioReferences(modelKey) ||
          !(
            references.imageReferenceIds?.length ||
            references.videoReferenceIds?.length ||
            references.endFrameId
          ))
      ) {
        notificationsService.error(
          'Audio references require a supported video model and an image or video reference.',
        );
        return false;
      }
      const initialCrunQuote = modelKey.startsWith('crun/')
        ? options?.getCurrentCrunQuote?.()
        : null;
      if (
        modelKey.startsWith('crun/') &&
        (!initialCrunQuote ||
          !(type === 'video'
            ? options?.crunVideoRequest
            : options?.crunRequest) ||
          consumedCrunQuoteRef.current === initialCrunQuote.quoteId)
      )
        return false;
      const jobDimensions = config.capabilities.hasAspectRatio
        ? { height: promptData.height, width: promptData.width }
        : {};
      const runId = crypto.randomUUID();
      const recipe = recipeFromPromptData(
        promptData,
        type,
        activeSettings,
        options?.originalText ?? promptText,
      );
      const capturedCrunRequest =
        type === 'video' ? options?.crunVideoRequest : options?.crunRequest;
      if (modelKey.startsWith('crun/') && capturedCrunRequest) {
        const controls = capturedCrunRequest.crunControls;
        recipe.modelKey = capturedCrunRequest.model;
        recipe.text = capturedCrunRequest.text;
        recipe.outputs = capturedCrunRequest.outputs ?? 1;
        recipe.references = [...(capturedCrunRequest.references ?? [])];
        recipe.aspectRatio = controls.aspectRatio;
        recipe.resolution = controls.resolution;
        recipe.duration =
          'duration' in controls ? controls.duration : undefined;
        recipe.endFrameId =
          'endFrame' in capturedCrunRequest
            ? capturedCrunRequest.endFrame
            : undefined;
        if (type === 'video') recipe.isAudioEnabled = false;
        recipe.crunControls = {
          modelKey: capturedCrunRequest.model,
          contractVersion: controls.contractVersion,
          ...(controls.aspectRatio !== undefined
            ? { aspectRatio: controls.aspectRatio }
            : {}),
          ...('outputFormat' in controls && controls.outputFormat !== undefined
            ? { outputFormat: controls.outputFormat }
            : {}),
          ...('negativePrompt' in controls &&
          controls.negativePrompt !== undefined
            ? { negativePrompt: controls.negativePrompt }
            : {}),
          ...('guidanceScale' in controls &&
          controls.guidanceScale !== undefined
            ? { guidanceScale: controls.guidanceScale }
            : {}),
          ...('translatePrompt' in controls &&
          controls.translatePrompt !== undefined
            ? { translatePrompt: controls.translatePrompt }
            : {}),
        };
      }
      const editingModelKey = modelKey;
      const flux = isFlux3ImageModel(
        type === 'image-edit' ? editingModelKey : modelKey,
      );
      const editSourceLimit = modelKey
        ? getImageEditMaxSources(modelKey)
        : Math.max(
            ...currentModels
              .filter((model) => isImageEditModel(model.key))
              .map((model) => getImageEditMaxSources(model.key)),
            getImageEditMaxSources(),
          );
      if (
        type === 'image-edit' &&
        (references.editSourceIds?.length ?? 0) > editSourceLimit
      ) {
        notificationsService.error(
          `This editing model accepts at most ${editSourceLimit} sources.`,
        );
        return false;
      }
      if (type === 'image-edit' && modelKey) {
        recipe.imageEdit = flux
          ? {
              contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
              operation: 'image-edit',
              model: editingModelKey,
              sourceIds: references.editSourceIds ?? [],
              resolution: activeSettings.resolution,
              aspectRatio: activeSettings.aspectRatio,
              grounding: false,
              outputs: 1,
            }
          : {
              contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
              operation: 'image-edit',
              model: modelKey,
              sourceIds: references.editSourceIds ?? [],
              maskId: references.editMaskId,
              size: references.editMaskId
                ? 'source'
                : (activeSettings.editSize ?? 'source'),
              quality: IMAGE_EDIT_QUALITY,
              outputs: activeSettings.outputs,
              seed: activeSettings.editSeed,
            };
      }
      if (type === 'image-edit')
        recipe.references = references.editSourceIds ?? [];
      const pendingContext = {
        ...jobDimensions,
        modelKey,
        promptText,
        recipe,
        ...(referencePreviewUrl ? { referencePreviewUrl } : {}),
        runId,
        type,
      };

      let isAccepted = false;
      setJobs((previous) => [
        ...Array.from(
          {
            length: config.capabilities.hasOutputs
              ? Math.max(1, activeSettings.outputs)
              : 1,
          },
          (_, index) => ({
            createdAt: Date.now(),
            id: `submitting-${runId}-${index}`,
            modelKey,
            prompt: promptText,
            recipe,
            ...(referencePreviewUrl ? { referencePreviewUrl } : {}),
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
          case 'image-edit': {
            const service = await getImagesService();
            assertConfirmedModelAvailable();
            const sources = references.editSourceIds ?? [];
            const data = (await service.postEdit(sources[0], {
              prompt: promptText.trim(),
              brand: brandId,
              ...(modelKey
                ? { model: modelKey }
                : {
                    autoSelectModel: true,
                    prioritize: activeSettings.prioritize,
                  }),
              references: sources.slice(1),
              ...(flux
                ? {
                    resolution: activeSettings.resolution,
                    aspectRatio: activeSettings.aspectRatio,
                  }
                : {
                    maskId: references.editMaskId,
                    size: references.editMaskId
                      ? 'source'
                      : (activeSettings.editSize ?? 'source'),
                    seed: activeSettings.editSeed,
                  }),
              outputs: flux ? 1 : activeSettings.outputs,
              sourceActionId: runId,
            })) as GenerationResponse;
            trackPendingIds(resolvePendingIds(data), pendingContext);
            isAccepted = true;
            break;
          }
          case 'image': {
            const service = await getImagesService();
            assertConfirmedModelAvailable();
            if (modelKey.startsWith('crun/')) {
              const request = options?.crunRequest;
              const quote = options?.getCurrentCrunQuote?.();
              if (
                !request ||
                !quote ||
                quote.quoteId !== initialCrunQuote?.quoteId ||
                request.model !== modelKey ||
                request.text !== promptText.trim() ||
                quote.modelKey !== modelKey ||
                quote.contractVersion !== request.crunControls.contractVersion
              )
                throw new Error('CRUN_QUOTE_STALE');
              consumedCrunQuoteRef.current = quote.quoteId;
              const data = (await service.post({
                ...request,
                crunQuoteId: quote.quoteId,
              })) as GenerationResponse;
              trackPendingIds(resolvePendingIds(data), pendingContext);
              isAccepted = true;
              break;
            }
            const payload = buildImagePayload(
              {
                ...buildBaseGenerationPayload(promptData, modelKey, brandId),
                ...(options?.requestedSkillSlugs?.length
                  ? { requestedSkillSlugs: options.requestedSkillSlugs }
                  : {}),
                ...(options?.promptId ? { promptId: options.promptId } : {}),
                ...(options?.harness !== undefined
                  ? { harness: options.harness }
                  : {}),
                ...(options?.knowledge ? { knowledge: options.knowledge } : {}),
                ...(options?.promptAuthor
                  ? { promptAuthor: options.promptAuthor }
                  : {}),
              },
              promptData,
            );
            if (flux) payload.aspectRatio = activeSettings.aspectRatio;
            const data = (await service.post(payload)) as GenerationResponse;
            trackPendingIds(resolvePendingIds(data), pendingContext);
            isAccepted = true;
            break;
          }

          case 'video': {
            const service = await getVideosService();
            assertConfirmedModelAvailable();
            if (modelKey.startsWith('crun/')) {
              const request = options?.crunVideoRequest;
              const quote = options?.getCurrentCrunQuote?.();
              if (
                !request ||
                !quote ||
                quote.quoteId !== initialCrunQuote?.quoteId ||
                request.model !== modelKey ||
                request.text !== promptText.trim() ||
                quote.modelKey !== modelKey ||
                quote.contractVersion !== request.crunControls.contractVersion
              )
                throw new Error('CRUN_QUOTE_STALE');
              consumedCrunQuoteRef.current = quote.quoteId;
              const data = (await service.post({
                ...request,
                crunQuoteId: quote.quoteId,
              })) as GenerationResponse;
              trackPendingIds(resolvePendingIds(data), pendingContext);
              isAccepted = true;
              break;
            }

            const videoPromptData = {
              ...promptData,
              endFrame: references.endFrameId,
              audioReferences: references.audioReferenceIds,
              videoReferences: references.videoReferenceIds,
            };
            const payload = buildVideoPayload(
              {
                ...buildBaseGenerationPayload(
                  videoPromptData,
                  modelKey,
                  brandId,
                ),
                ...(options?.requestedSkillSlugs?.length
                  ? { requestedSkillSlugs: options.requestedSkillSlugs }
                  : {}),
                ...(options?.promptId ? { promptId: options.promptId } : {}),
                ...(options?.harness !== undefined
                  ? { harness: options.harness }
                  : {}),
                ...(options?.knowledge ? { knowledge: options.knowledge } : {}),
                ...(options?.promptAuthor
                  ? { promptAuthor: options.promptAuthor }
                  : {}),
              },
              videoPromptData,
            );
            const data = (await service.post(payload)) as GenerationResponse;
            trackPendingIds(resolvePendingIds(data), pendingContext);
            isAccepted = true;
            break;
          }

          case 'music': {
            const service = await getMusicsService();
            assertConfirmedModelAvailable();
            const musicPromptData = {
              ...promptData,
              instrumental: activeSettings.instrumental,
              lyrics: activeSettings.lyrics,
              // `buildStudioPromptData` only fills `style` for `hasLook`
              // types (image/video) — music carries its own genre/style
              // control (`hasStyle`), so read it straight off settings the
              // same way instrumental/lyrics do. `PromptTextareaSchema.style`
              // is a required string, so default the unset case the same
              // way `buildStudioPromptData` itself does.
              style: activeSettings.style ?? '',
            };
            const payload = buildMusicPayload(
              musicPromptData,
              modelKey,
              activeSettings.duration,
            );
            const data = (await service.post(
              payload as Parameters<MusicsService['post']>[0],
            )) as GenerationResponse;
            trackPendingIds(resolvePendingIds(data), pendingContext);
            isAccepted = true;
            break;
          }

          case 'avatar': {
            const service = await getHeyGenService();
            assertConfirmedModelAvailable();
            const data = await service.generate(
              buildStudioAvatarRequest(
                activeSettings,
                resolveStudioAvatarScript(promptData.speech, promptData.text),
                modelKey,
              ),
            );
            trackPendingIds([resolveJsonApiIngredientId(data)], pendingContext);
            isAccepted = true;
            break;
          }

          case 'voice': {
            // `voiceProvider` says which catalog `voiceId` belongs to; without
            // it the server cannot tell an ElevenLabs id from a HeyGen one.
            const voiceProvider = resolveSpeechVoiceProvider(
              activeSettings.voiceRef,
            );
            if (!activeSettings.voiceId || !voiceProvider) {
              notificationsService.error('Pick a voice before generating');
              break;
            }

            const speakingProvider = resolveSpeakingVoiceProvider(modelKey);
            if (speakingProvider && speakingProvider !== voiceProvider) {
              notificationsService.error(
                'Pick a voice that matches the selected speech model',
              );
              break;
            }

            const service = await getVoicesService();
            assertConfirmedModelAvailable();
            // Text-to-speech runs inline on the API and returns the finished
            // ingredient, so there is no socket phase to wait on.
            const voice = await service.generate({
              ...(modelKey
                ? { model: modelKey }
                : {
                    autoSelectModel: true,
                    prioritize: activeSettings.prioritize,
                  }),
              speed: 1,
              text: promptData.speech?.trim() || promptText.trim(),
              voiceId: activeSettings.voiceId,
              voiceProvider,
            });

            if (activeBrandRef.current !== brandId) return false;
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
            notifyGenerated();
            isAccepted = true;
            break;
          }

          default:
            logger.error(`Unsupported Studio generation type: ${type}`);
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === CONFIRMED_MODEL_UNAVAILABLE_ERROR
        ) {
          setJobs((previous) => previous.filter((job) => job.runId !== runId));
          notificationsService.error(
            translateSpend('confirmedModelUnavailable'),
          );
          return false;
        }
        if (activeBrandRef.current !== brandId) return false;
        logger.error('Studio generation failed', error);
        const message = modelKey.startsWith('crun/')
          ? translateCrun(
              error instanceof Error && error.message === 'CRUN_QUOTE_STALE'
                ? 'quoteStale'
                : 'reasons.CRUN_PROVIDER_UNAVAILABLE',
            )
          : toErrorMessage(error, `Failed to generate ${config.label}`);

        const persistedIds =
          type === 'video' ? getPersistedVideoIngredientIds(error) : [];
        const reconciled: StudioPlaygroundJob[] = [];
        const pendingIds: string[] = [];
        for (const id of persistedIds) {
          const shell: StudioPlaygroundJob = {
            createdAt: Date.now(),
            ...jobDimensions,
            id,
            ingredientId: id,
            modelKey: modelKey || undefined,
            prompt: promptText,
            recipe,
            ...(referencePreviewUrl ? { referencePreviewUrl } : {}),
            runId,
            status: IngredientStatus.PROCESSING,
            type,
          };
          try {
            const service = await getVideosService();
            if (activeBrandRef.current !== brandId) return false;
            const ingredient = await service.findOne(id, { brandId });
            if (activeBrandRef.current !== brandId) return false;
            if (
              !ingredient ||
              ingredient.id !== id ||
              ingredient.brandId !== brandId ||
              ingredient.category !== IngredientCategory.VIDEO ||
              ingredient.isDeleted ||
              !Object.values(IngredientStatus).includes(ingredient.status)
            )
              continue;
            const hydrated = toStudioPlaygroundJob(ingredient);
            if (!hydrated) continue;
            reconciled.push({
              ...hydrated,
              recipe,
              ...(referencePreviewUrl ? { referencePreviewUrl } : {}),
              runId,
            });
            if (isStudioPlaygroundJobPending(ingredient.status))
              pendingIds.push(id);
          } catch (readError) {
            if (activeBrandRef.current !== brandId) return false;
            const status = getErrorStatus(readError);
            if (status !== undefined && status >= 400 && status < 500) continue;
            reconciled.push({
              ...shell,
              error: 'The result could not be loaded. Reconnecting…',
              phase: 'saving',
            });
            pendingIds.push(id);
          }
        }
        if (activeBrandRef.current !== brandId) return false;
        // Publish only after scoped initial hydration settles, so refused IDs
        // can never trigger the existing immediate fallback polling effect.
        setJobs((previous) =>
          mergeStudioPlaygroundJobs(
            previous.filter(
              (job) => job.runId !== runId || job.phase !== 'submitting',
            ),
            reconciled.length
              ? reconciled
              : [
                  {
                    createdAt: Date.now(),
                    error: message,
                    ...jobDimensions,
                    id: `failed-${crypto.randomUUID()}`,
                    modelKey: modelKey || undefined,
                    prompt: promptText,
                    recipe,
                    ...(referencePreviewUrl ? { referencePreviewUrl } : {}),
                    runId,
                    status: IngredientStatus.FAILED,
                    type,
                  },
                ],
          ),
        );
        for (const id of pendingIds) {
          if (activeBrandRef.current !== brandId) return false;
          subscribeToPendingJob(id, type);
        }
        notifyGenerated();
        window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
        notificationsService.error(message);
      }

      // Admission reserves credits before the provider answers, accepted or not.
      requestTopbarBalancesRefresh();
      return isAccepted;
    },
    [
      brandId,
      getHeyGenService,
      getImagesService,
      getMusicsService,
      getVideosService,
      getVoicesService,
      notificationsService,
      settings,
      trackPendingIds,
      subscribeToPendingJob,
      translateCrun,
      translateSpend,
      type,
      notifyGenerated,
    ],
  );

  return {
    cancelJob,
    clearJobs,
    jobs: jobsBrandId === brandId ? jobs : [],
    rehydratePending,
    removeJob,
    submit,
  };
}
