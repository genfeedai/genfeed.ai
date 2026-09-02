'use client';

import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  canMergeStoryboard,
  createStoryboardFrame,
  getCompletedFrames,
  getFailedFrames,
  getPendingFrames,
  initializeStoryboard,
  type Storyboard,
  type StoryboardFrame,
} from '@genfeedai/client/schemas';
import { IngredientCategory, IngredientFormat } from '@genfeedai/contracts';
import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import type {
  IStoryboardMergeSettings,
  IStoryboardSceneProgress,
} from '@genfeedai/contracts/interfaces/components/storyboard.interface';
import type { IVideoMergeParams } from '@genfeedai/contracts/interfaces/components/video-operations.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useMergeProgress } from '@hooks/storyboard/use-merge-progress/use-merge-progress';
import { useStoryboardGeneration } from '@pages/studio/generate/hooks/useStoryboardGeneration';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type StoryboardWorkspaceMode = 'interpolate' | 'scenes' | 'merge';

function parseMode(value: string | null): StoryboardWorkspaceMode {
  if (value === 'scenes' || value === 'merge' || value === 'interpolate') {
    return value;
  }
  return 'interpolate';
}

export function useStoryboardWorkspace() {
  const searchParams = useSearchParams();
  const { brandId } = useBrand();
  const { setGeneratedAssetId } = useAssetSelection();
  const { videoModels } = useElements();
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const seededReferenceRef = useRef<string | null>(null);

  const [mode, setMode] = useState<StoryboardWorkspaceMode>(() =>
    parseMode(searchParams.get('mode')),
  );
  const [format, setFormat] = useState<IngredientFormat>(() => {
    const fromUrl = searchParams.get('format')?.toLowerCase();
    if (
      fromUrl &&
      Object.values(IngredientFormat).includes(fromUrl as IngredientFormat)
    ) {
      return fromUrl as IngredientFormat;
    }
    return IngredientFormat.PORTRAIT;
  });
  const [storyboard, setStoryboard] = useState<Storyboard>(() =>
    initializeStoryboard(IngredientFormat.PORTRAIT),
  );
  const [mergeVideoIds, setMergeVideoIds] = useState<IVideo[]>([]);
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [sceneProgress, setSceneProgress] =
    useState<IStoryboardSceneProgress | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeIngredientId, setMergeIngredientId] = useState<string | null>(
    null,
  );
  const [promptText, setPromptText] = useState('');

  // Scene generation is a long-running sequential batch. The controller lets
  // the user stop it, and the unmount cleanup makes navigating away cancel the
  // request in flight instead of resolving into an unmounted component.
  const sceneAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sceneAbortRef.current?.abort();
    };
  }, []);

  const promptConfig = useMemo(
    () => ({
      duration: 5,
      format,
      height:
        format === IngredientFormat.LANDSCAPE
          ? 1080
          : format === IngredientFormat.SQUARE
            ? 1080
            : 1920,
      isValid: true,
      models: videoModels.map((model) => model.key).filter(Boolean) as string[],
      width:
        format === IngredientFormat.LANDSCAPE
          ? 1920
          : format === IngredientFormat.SQUARE
            ? 1080
            : 1080,
    }),
    [format, videoModels],
  );

  const findAllAssets = useCallback(async () => {
    // Storyboard workspace is not bound to the generate grid; no-op refresh.
  }, []);

  const {
    cameraMovementPreset,
    clearStoryboard: clearInterpolate,
    customCameraPrompt,
    frames: interpolateFrames,
    handleGenerateStoryboard,
    hasInterpolationModel,
    isStoryboardGenerating,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setFrames: setInterpolateFrames,
  } = useStoryboardGeneration({
    brandId,
    currentModels: videoModels,
    findAllAssets,
    promptConfig,
    promptText,
    setGeneratedAssetId,
  });

  useEffect(() => {
    setStoryboard((current) =>
      current.format === format ? current : { ...current, format },
    );
  }, [format]);

  const addSceneImages = useCallback((images: IImage[]) => {
    setStoryboard((current) => {
      const existingIds = new Set(
        current.frames.map((frame) => frame.imageId).filter(Boolean),
      );
      const nextFrames = images
        .filter((image) => image.id && !existingIds.has(image.id))
        .map((image, index) =>
          createStoryboardFrame(
            image.id,
            image.ingredientUrl || image.thumbnailUrl || '',
            current.frames.length + index,
            {
              imageThumbnailUrl: image.thumbnailUrl,
              prompt: '',
            },
          ),
        );
      if (nextFrames.length === 0) {
        return current;
      }
      return { ...current, frames: [...current.frames, ...nextFrames] };
    });
  }, []);

  // Seed scenes from deep-link (e.g. Add to Storyboard from image grid).
  useEffect(() => {
    const referenceImageId = searchParams.get('referenceImageId');
    if (!referenceImageId || seededReferenceRef.current === referenceImageId) {
      return;
    }

    seededReferenceRef.current = referenceImageId;
    setMode('scenes');

    let isCancelled = false;
    void (async () => {
      try {
        const imagesService = await getImagesService();
        const image = await imagesService.findOne(referenceImageId);
        if (isCancelled || !image?.id) {
          return;
        }
        addSceneImages([image as unknown as IImage]);
        notificationsService.success('Image added to storyboard scenes');
      } catch (error) {
        logger.error('Failed to seed storyboard image', error);
        notificationsService.error('Failed to load image for storyboard');
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [addSceneImages, getImagesService, notificationsService, searchParams]);

  const updateSceneFrame = useCallback(
    (frameId: string, patch: Partial<StoryboardFrame>) => {
      setStoryboard((current) => ({
        ...current,
        frames: current.frames.map((frame) =>
          frame.id === frameId ? { ...frame, ...patch } : frame,
        ),
      }));
    },
    [],
  );

  const removeSceneFrame = useCallback((frameId: string) => {
    setStoryboard((current) => ({
      ...current,
      frames: current.frames
        .filter((frame) => frame.id !== frameId)
        .map((frame, order) => ({ ...frame, order })),
    }));
  }, []);

  const clearScenes = useCallback(() => {
    setStoryboard(initializeStoryboard(format));
  }, [format]);

  /**
   * Put a cancelled batch back where it was: frames left mid-flight return to
   * `pending` so they stay eligible for the next run.
   */
  const restoreCancelledFrames = useCallback((batch: StoryboardFrame[]) => {
    const batchIds = new Set(batch.map((frame) => frame.id));
    setStoryboard((current) => ({
      ...current,
      frames: current.frames.map((frame) =>
        batchIds.has(frame.id) && frame.status === 'generating'
          ? { ...frame, error: undefined, status: 'pending' }
          : frame,
      ),
    }));
  }, []);

  const runSceneGeneration = useCallback(
    async (batch: StoryboardFrame[]) => {
      if (!brandId) {
        notificationsService.error('Set up a brand before generating');
        return;
      }

      if (batch.length === 0) {
        notificationsService.error(
          'Add images with prompts (at least 10 characters) to generate',
        );
        return;
      }

      const modelKey =
        videoModels.find((model) => model.isDefault)?.key ??
        videoModels[0]?.key;
      if (!modelKey) {
        notificationsService.error('No video model available for scenes');
        return;
      }

      // A second run while one is in flight would race the same frames.
      if (sceneAbortRef.current) {
        return;
      }

      const controller = new AbortController();
      sceneAbortRef.current = controller;
      setIsGeneratingScenes(true);
      setSceneProgress({ current: 0, total: batch.length });

      let succeededCount = 0;
      let failedCount = 0;

      try {
        const service = await getVideosService();

        for (const [index, frame] of batch.entries()) {
          if (controller.signal.aborted) {
            break;
          }

          setSceneProgress({ current: index + 1, total: batch.length });
          updateSceneFrame(frame.id, {
            error: undefined,
            status: 'generating',
          });

          try {
            const created = await service.post(
              {
                brand: brandId,
                duration: frame.duration,
                format: storyboard.format,
                model: modelKey,
                references: frame.imageId ? [frame.imageId] : [],
                text: frame.prompt,
                useTemplate: true,
              },
              controller.signal,
            );

            if (controller.signal.aborted) {
              break;
            }

            succeededCount += 1;
            updateSceneFrame(frame.id, {
              status: 'completed',
              videoId: created.id,
              videoThumbnailUrl: created.thumbnailUrl,
              videoUrl: created.ingredientUrl,
            });
            if (created.id) {
              setGeneratedAssetId(created.id);
            }
          } catch (error) {
            // An aborted request throws too — that is a cancel, not a failure.
            if (controller.signal.aborted) {
              break;
            }

            failedCount += 1;
            logger.error('Failed to generate storyboard scene', error);
            updateSceneFrame(frame.id, {
              error: getErrorMessage(error, 'Generation failed'),
              status: 'failed',
            });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Storyboard scene generation stopped', error);
          notificationsService.error('Scene generation could not start');
        }
      } finally {
        const wasCancelled = controller.signal.aborted;
        sceneAbortRef.current = null;

        if (isMountedRef.current) {
          if (wasCancelled) {
            restoreCancelledFrames(batch);
          }

          setIsGeneratingScenes(false);
          setSceneProgress(null);

          if (wasCancelled) {
            notificationsService.info(
              `Scene generation cancelled · ${succeededCount} of ${batch.length} generated`,
            );
          } else if (failedCount === 0 && succeededCount > 0) {
            notificationsService.success(
              `Generated ${succeededCount} of ${batch.length} scenes`,
            );
          } else if (succeededCount === 0) {
            notificationsService.error(
              `All ${batch.length} scenes failed — check the errors and retry`,
            );
          } else {
            notificationsService.warning(
              `Generated ${succeededCount} of ${batch.length} scenes · ${failedCount} failed — retry the failed ones`,
            );
          }
        }
      }
    },
    [
      brandId,
      getVideosService,
      notificationsService,
      restoreCancelledFrames,
      setGeneratedAssetId,
      storyboard.format,
      updateSceneFrame,
      videoModels,
    ],
  );

  const generatePendingScenes = useCallback(
    () => runSceneGeneration(getPendingFrames(storyboard)),
    [runSceneGeneration, storyboard],
  );

  const retryFailedScenes = useCallback(
    () => runSceneGeneration(getFailedFrames(storyboard)),
    [runSceneGeneration, storyboard],
  );

  const retrySceneFrame = useCallback(
    (frameId: string) => {
      const frame = storyboard.frames.find(
        (candidate) => candidate.id === frameId,
      );
      return runSceneGeneration(frame ? [frame] : []);
    },
    [runSceneGeneration, storyboard],
  );

  const cancelSceneGeneration = useCallback(() => {
    sceneAbortRef.current?.abort();
  }, []);

  const mergeSettings = useMemo<IStoryboardMergeSettings>(
    () => ({
      isCaptionsEnabled: storyboard.isCaptionsEnabled,
      isMuteVideoAudio: storyboard.isMuteVideoAudio,
      transition: storyboard.transition,
      transitionDuration: storyboard.transitionDuration,
      transitionEaseCurve: storyboard.transitionEaseCurve,
    }),
    [
      storyboard.isCaptionsEnabled,
      storyboard.isMuteVideoAudio,
      storyboard.transition,
      storyboard.transitionDuration,
      storyboard.transitionEaseCurve,
    ],
  );

  const updateMergeSettings = useCallback(
    (patch: Partial<IStoryboardMergeSettings>) => {
      setStoryboard((current) => ({ ...current, ...patch }));
    },
    [],
  );

  const handleMergeComplete = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }
    setIsMerging(false);
    notificationsService.success('Merged video is ready');
  }, [notificationsService]);

  const handleMergeError = useCallback(
    (error: string) => {
      logger.error('Storyboard merge failed', error);
      if (!isMountedRef.current) {
        return;
      }
      setIsMerging(false);
      notificationsService.error(error || 'Merge failed');
    },
    [notificationsService],
  );

  // The merge POST only enqueues the job; progress and the terminal state
  // arrive over the socket. `isMerging` therefore stays true until this hook
  // reports done — clearing it when the POST resolved made a multi-minute
  // render look finished the instant it started.
  const { overallProgress: mergeProgress, steps: mergeSteps } =
    useMergeProgress({
      hasMusic: Boolean(storyboard.musicId),
      ingredientId: mergeIngredientId ?? undefined,
      onComplete: handleMergeComplete,
      onError: handleMergeError,
    });

  const dismissMergeProgress = useCallback(() => {
    setMergeIngredientId(null);
    setIsMerging(false);
  }, []);

  const mergeStoryboardVideos = useCallback(async () => {
    if (!canMergeStoryboard(storyboard)) {
      notificationsService.error(
        'Generate at least two completed scene videos before merging',
      );
      return;
    }

    // Same source of truth as `completedSceneCount`, which drives the button's
    // disabled state — a partially generated storyboard merges what it has.
    const ids = getCompletedFrames(storyboard)
      .map((frame) => frame.videoId)
      .filter((id): id is string => Boolean(id));

    setMergeIngredientId(null);
    setIsMerging(true);
    try {
      const service = await getVideosService();
      const payload: IVideoMergeParams = {
        category: IngredientCategory.VIDEO,
        ids,
        ...mergeSettings,
      };
      const merged = await service.postMerge(payload);
      if (merged.id) {
        setGeneratedAssetId(merged.id);
        setMergeIngredientId(merged.id);
      } else {
        // No id means nothing to track — do not strand the UI in "merging".
        setIsMerging(false);
      }
      notificationsService.success('Merged storyboard video started');
    } catch (error) {
      logger.error('Failed to merge storyboard', error);
      notificationsService.error(
        getErrorMessage(error, 'Failed to merge storyboard videos'),
      );
      setIsMerging(false);
    }
  }, [
    getVideosService,
    mergeSettings,
    notificationsService,
    setGeneratedAssetId,
    storyboard,
  ]);

  const addMergeVideos = useCallback((videos: IVideo[]) => {
    setMergeVideoIds((current) => {
      const existing = new Set(current.map((video) => video.id));
      const next = videos.filter(
        (video) => video.id && !existing.has(video.id),
      );
      return next.length > 0 ? [...current, ...next] : current;
    });
  }, []);

  const removeMergeVideo = useCallback((videoId: string) => {
    setMergeVideoIds((current) =>
      current.filter((video) => video.id !== videoId),
    );
  }, []);

  const clearMergeVideos = useCallback(() => {
    setMergeVideoIds([]);
  }, []);

  const mergeSelectedVideos = useCallback(async () => {
    if (mergeVideoIds.length < 2) {
      notificationsService.error('Select at least two videos to merge');
      return;
    }

    setMergeIngredientId(null);
    setIsMerging(true);
    try {
      const service = await getVideosService();
      // Same settings object as the scene merge — hardcoding defaults here made
      // the transition and caption controls silently inert in this mode.
      const payload: IVideoMergeParams = {
        category: IngredientCategory.VIDEO,
        ids: mergeVideoIds.map((video) => video.id),
        ...mergeSettings,
      };
      const merged = await service.postMerge(payload);
      if (merged.id) {
        setGeneratedAssetId(merged.id);
        setMergeIngredientId(merged.id);
      } else {
        setIsMerging(false);
      }
      notificationsService.success('Video merge started');
    } catch (error) {
      logger.error('Failed to merge videos', error);
      notificationsService.error(
        getErrorMessage(error, 'Failed to merge videos'),
      );
      setIsMerging(false);
    }
  }, [
    getVideosService,
    mergeSettings,
    mergeVideoIds,
    notificationsService,
    setGeneratedAssetId,
  ]);

  const pendingSceneCount = getPendingFrames(storyboard).length;
  const completedSceneCount = getCompletedFrames(storyboard).length;
  const failedSceneCount = getFailedFrames(storyboard).length;

  return {
    addMergeVideos,
    addSceneImages,
    cameraMovementPreset,
    cancelSceneGeneration,
    clearInterpolate,
    clearMergeVideos,
    clearScenes,
    completedSceneCount,
    customCameraPrompt,
    dismissMergeProgress,
    failedSceneCount,
    format,
    generatePendingScenes,
    handleGenerateStoryboard,
    hasInterpolationModel,
    interpolateFrames,
    isGeneratingScenes,
    isMerging,
    isStoryboardGenerating,
    mergeProgress,
    mergeSelectedVideos,
    mergeSettings,
    mergeSteps,
    mergeStoryboardVideos,
    mergeVideoIds,
    mode,
    pendingSceneCount,
    promptText,
    removeMergeVideo,
    removeSceneFrame,
    retryFailedScenes,
    retrySceneFrame,
    sceneProgress,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setFormat,
    setInterpolateFrames,
    setMode,
    setPromptText,
    storyboard,
    updateMergeSettings,
    updateSceneFrame,
  };
}
