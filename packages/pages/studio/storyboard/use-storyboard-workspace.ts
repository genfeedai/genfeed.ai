'use client';

import { useAssetSelection } from '@contexts/ui/asset-selection.context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  canMergeStoryboard,
  createStoryboardFrame,
  getPendingFrames,
  initializeStoryboard,
  type Storyboard,
  type StoryboardFrame,
} from '@genfeedai/client/schemas';
import { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import type { IImage, IVideo } from '@genfeedai/interfaces';
import type { IVideoMergeParams } from '@genfeedai/interfaces/components/video-operations.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useStoryboardGeneration } from '@pages/studio/generate/hooks/useStoryboardGeneration';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ImagesService } from '@services/ingredients/images.service';
import { VideosService } from '@services/ingredients/videos.service';
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
  const [isMerging, setIsMerging] = useState(false);
  const [promptText, setPromptText] = useState('');

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

  const generatePendingScenes = useCallback(async () => {
    if (!brandId) {
      notificationsService.error('Set up a brand before generating');
      return;
    }

    const pending = getPendingFrames(storyboard);
    if (pending.length === 0) {
      notificationsService.error(
        'Add images with prompts (at least 10 characters) to generate',
      );
      return;
    }

    const modelKey =
      videoModels.find((model) => model.isDefault)?.key ?? videoModels[0]?.key;
    if (!modelKey) {
      notificationsService.error('No video model available for scenes');
      return;
    }

    setIsGeneratingScenes(true);
    try {
      const service = await getVideosService();
      for (const frame of pending) {
        updateSceneFrame(frame.id, { status: 'generating', error: undefined });
        try {
          const created = await service.post({
            brand: brandId,
            duration: frame.duration,
            format: storyboard.format,
            model: modelKey,
            references: frame.imageId ? [frame.imageId] : [],
            text: frame.prompt,
            useTemplate: true,
          } as never);

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
          logger.error('Failed to generate storyboard scene', error);
          updateSceneFrame(frame.id, {
            error: 'Generation failed',
            status: 'failed',
          });
        }
      }
      notificationsService.success('Scene generation finished');
    } finally {
      setIsGeneratingScenes(false);
    }
  }, [
    brandId,
    getVideosService,
    notificationsService,
    setGeneratedAssetId,
    storyboard,
    updateSceneFrame,
    videoModels,
  ]);

  const mergeStoryboardVideos = useCallback(async () => {
    if (!canMergeStoryboard(storyboard)) {
      notificationsService.error(
        'Generate at least two completed scene videos before merging',
      );
      return;
    }

    const ids = storyboard.frames
      .map((frame) => frame.videoId)
      .filter((id): id is string => Boolean(id));

    setIsMerging(true);
    try {
      const service = await getVideosService();
      const payload: IVideoMergeParams = {
        category: IngredientCategory.VIDEO,
        ids,
        isCaptionsEnabled: storyboard.isCaptionsEnabled,
        isMuteVideoAudio: storyboard.isMuteVideoAudio,
        transition: storyboard.transition,
        transitionDuration: storyboard.transitionDuration,
        transitionEaseCurve: storyboard.transitionEaseCurve,
      };
      const merged = await service.postMerge(payload);
      if (merged.id) {
        setGeneratedAssetId(merged.id);
      }
      notificationsService.success('Merged storyboard video started');
    } catch (error) {
      logger.error('Failed to merge storyboard', error);
      notificationsService.error('Failed to merge storyboard videos');
    } finally {
      setIsMerging(false);
    }
  }, [
    getVideosService,
    notificationsService,
    setGeneratedAssetId,
    storyboard,
  ]);

  const addMergeVideos = useCallback((videos: IVideo[]) => {
    setMergeVideoIds((current) => {
      const existing = new Set(current.map((video) => video.id));
      const next = videos.filter((video) => video.id && !existing.has(video.id));
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

    setIsMerging(true);
    try {
      const service = await getVideosService();
      const payload: IVideoMergeParams = {
        category: IngredientCategory.VIDEO,
        ids: mergeVideoIds.map((video) => video.id),
        isCaptionsEnabled: false,
      };
      const merged = await service.postMerge(payload);
      if (merged.id) {
        setGeneratedAssetId(merged.id);
      }
      notificationsService.success('Video merge started');
    } catch (error) {
      logger.error('Failed to merge videos', error);
      notificationsService.error('Failed to merge videos');
    } finally {
      setIsMerging(false);
    }
  }, [
    getVideosService,
    mergeVideoIds,
    notificationsService,
    setGeneratedAssetId,
  ]);

  const pendingSceneCount = getPendingFrames(storyboard).length;
  const completedSceneCount = storyboard.frames.filter(
    (frame) => frame.status === 'completed' && frame.videoId,
  ).length;

  return {
    addMergeVideos,
    addSceneImages,
    cameraMovementPreset,
    clearInterpolate,
    clearMergeVideos,
    clearScenes,
    completedSceneCount,
    customCameraPrompt,
    format,
    generatePendingScenes,
    handleGenerateStoryboard,
    hasInterpolationModel,
    interpolateFrames,
    isGeneratingScenes,
    isMerging,
    isStoryboardGenerating,
    mergeSelectedVideos,
    mergeStoryboardVideos,
    mergeVideoIds,
    mode,
    pendingSceneCount,
    promptText,
    removeMergeVideo,
    removeSceneFrame,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setFormat,
    setInterpolateFrames,
    setMode,
    setPromptText,
    storyboard,
    updateSceneFrame,
  };
}
