'use client';

import { useAssetSelection } from '@contexts/ui/asset-selection-context';
import { IngredientStatus } from '@genfeedai/enums';
import type { IImage } from '@genfeedai/interfaces';
import type { SocketResult } from '@genfeedai/interfaces/content/generation-payload.interface';
import type { CameraMovementPreset } from '@genfeedai/interfaces/studio/camera-movement.interface';
import { buildGenerationEtaSnapshot } from '@helpers/generation-eta.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type {
  UseStoryboardGenerationParams,
  UseStoryboardGenerationReturn,
} from '@pages/studio/generate/types';
import {
  buildStoryboardInterpolationPairs,
  getStoryboardCameraPrompt,
  getStoryboardInterpolationModels,
  resolveStoryboardDuration,
  resolveStoryboardFormat,
  resolveStoryboardModelKey,
} from '@pages/studio/generate/utils/storyboard-generation';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_STORYBOARD_PRESET: CameraMovementPreset = 'dolly-forward';

function getSocketResultId(result: SocketResult, fallbackId: string): string {
  if (typeof result === 'string') {
    return result;
  }

  return typeof result.id === 'string' ? result.id : fallbackId;
}

export function useStoryboardGeneration({
  brandId,
  currentModels,
  findAllAssets,
  promptConfig,
  promptText,
  setGeneratedAssetId,
}: UseStoryboardGenerationParams): UseStoryboardGenerationReturn {
  const { addToGenerationQueue, updateGenerationStatus } = useAssetSelection();
  const { subscribe } = useSocketManager();
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const socketSubscriptionsRef = useRef<Array<() => void>>([]);
  const [frames, setFrames] = useState<IImage[]>([]);
  const [cameraMovementPreset, setCameraMovementPreset] =
    useState<CameraMovementPreset>(DEFAULT_STORYBOARD_PRESET);
  const [customCameraPrompt, setCustomCameraPrompt] = useState('');
  const [isStoryboardGenerating, setIsStoryboardGenerating] = useState(false);
  const storyboardModels = useMemo(
    () => getStoryboardInterpolationModels(currentModels),
    [currentModels],
  );

  useEffect(() => {
    return () => {
      socketSubscriptionsRef.current.forEach((unsubscribe) => {
        unsubscribe();
      });
      socketSubscriptionsRef.current = [];
    };
  }, []);

  const appendStoryboardFrames = useCallback((incomingFrames: IImage[]) => {
    setFrames((currentFrames) => {
      const existingIds = new Set(currentFrames.map((frame) => frame.id));
      const nextFrames = incomingFrames.filter(
        (frame) => frame.id && !existingIds.has(frame.id),
      );
      return nextFrames.length > 0
        ? [...currentFrames, ...nextFrames]
        : currentFrames;
    });
  }, []);

  const clearStoryboard = useCallback(() => {
    setFrames([]);
    setCustomCameraPrompt('');
    setCameraMovementPreset(DEFAULT_STORYBOARD_PRESET);
  }, []);

  const handleGenerateStoryboard = useCallback(async () => {
    if (!brandId) {
      notificationsService.error('Please set up a brand before generating');
      return;
    }

    if (frames.length < 2) {
      notificationsService.error('Select at least two storyboard frames');
      return;
    }

    const configuredModels =
      Array.isArray(promptConfig.models) && promptConfig.models.length > 0
        ? promptConfig.models
        : undefined;
    const modelKey = resolveStoryboardModelKey(
      storyboardModels,
      configuredModels,
    );

    if (!modelKey) {
      notificationsService.error(
        'No interpolation-capable video model available for storyboard',
      );
      return;
    }

    const cameraPrompt = getStoryboardCameraPrompt(
      cameraMovementPreset,
      customCameraPrompt,
    );
    const pairs = buildStoryboardInterpolationPairs(frames, promptText);

    if (pairs.length === 0) {
      notificationsService.error('Storyboard frames must have valid image IDs');
      return;
    }

    setIsStoryboardGenerating(true);

    try {
      const service = await getVideosService();
      const duration = resolveStoryboardDuration(promptConfig.duration);
      const format = resolveStoryboardFormat(promptConfig.format);
      const result = await service.postBatchInterpolation({
        cameraPrompt,
        duration,
        format,
        isMergeEnabled: true,
        modelKey,
        pairs,
        promptTemplate:
          typeof promptConfig.prompt_template === 'string'
            ? promptConfig.prompt_template
            : undefined,
        useTemplate: true,
      });

      const processingJobs = result.jobs.filter(
        (job) => job.id && job.status === 'processing',
      );

      if (processingJobs.length === 0) {
        notificationsService.error('Storyboard generation did not start');
        return;
      }

      setGeneratedAssetId(processingJobs[0].id);

      let completedCount = 0;
      const totalExpected = processingJobs.length;
      const generationPrompt =
        promptText.trim() || cameraPrompt || 'Storyboard interpolation';

      processingJobs.forEach((job) => {
        const startedAt = new Date();
        const etaSnapshot = buildGenerationEtaSnapshot({
          currentPhase: 'Queued',
          durationSeconds: duration,
          extraProcessingCount: 1,
          height: promptConfig.height,
          model: modelKey,
          promptText: generationPrompt,
          resolution: format,
          startedAt,
          type: 'video',
          width: promptConfig.width,
        });

        addToGenerationQueue({
          currentPhase: etaSnapshot?.currentPhase ?? 'Queued',
          estimatedDurationMs: etaSnapshot?.estimatedDurationMs,
          etaConfidence: etaSnapshot?.etaConfidence,
          id: job.id,
          lastEtaUpdateAt: etaSnapshot?.lastEtaUpdateAt,
          model: modelKey,
          prompt: generationPrompt,
          remainingDurationMs: etaSnapshot?.remainingDurationMs,
          startTime: startedAt,
          status: [IngredientStatus.PROCESSING],
          type: 'video',
        });

        const url = `/videos/${job.id}`;
        let unsubscribe: (() => void) | null = null;
        const cleanupSubscription = () => {
          if (!unsubscribe) {
            return;
          }
          unsubscribe();
          socketSubscriptionsRef.current =
            socketSubscriptionsRef.current.filter((fn) => fn !== unsubscribe);
          unsubscribe = null;
        };

        const handler = createMediaHandler<SocketResult>(
          (socketResult) => {
            const resultId = getSocketResultId(socketResult, job.id);
            completedCount += 1;
            updateGenerationStatus(job.id, {
              currentPhase: 'Completed',
              lastEtaUpdateAt: new Date().toISOString(),
              remainingDurationMs: 0,
              resultId,
              status: [IngredientStatus.GENERATED],
            });

            if (completedCount === totalExpected) {
              void findAllAssets(1, false, true);
            }
            cleanupSubscription();
          },
          (errorMessage) => {
            completedCount += 1;
            updateGenerationStatus(job.id, {
              currentPhase: 'Failed',
              error: errorMessage,
              lastEtaUpdateAt: new Date().toISOString(),
              remainingDurationMs: 0,
              status: [IngredientStatus.FAILED],
            });
            notificationsService.error(errorMessage);

            if (completedCount === totalExpected) {
              void findAllAssets(1, false, true);
            }
            cleanupSubscription();
          },
          (progress) => {
            updateGenerationStatus(job.id, {
              currentPhase: progress.stage || 'Processing',
              lastEtaUpdateAt: new Date().toISOString(),
              remainingDurationMs:
                typeof progress.eta === 'number' ? progress.eta : undefined,
            });
          },
        );

        unsubscribe = subscribe(url, handler);
        socketSubscriptionsRef.current.push(unsubscribe);
      });

      notificationsService.success(
        `Started ${processingJobs.length} storyboard transition${
          processingJobs.length === 1 ? '' : 's'
        }`,
      );
      await findAllAssets(1, false, true);
    } catch (error) {
      logger.error('Failed to generate storyboard transitions', error);
      notificationsService.error('Failed to generate storyboard');
    } finally {
      setIsStoryboardGenerating(false);
    }
  }, [
    addToGenerationQueue,
    brandId,
    cameraMovementPreset,
    customCameraPrompt,
    findAllAssets,
    frames,
    getVideosService,
    notificationsService,
    promptConfig.duration,
    promptConfig.format,
    promptConfig.height,
    promptConfig.models,
    promptConfig.prompt_template,
    promptConfig.width,
    promptText,
    setGeneratedAssetId,
    subscribe,
    storyboardModels,
    updateGenerationStatus,
  ]);

  return {
    appendStoryboardFrames,
    cameraMovementPreset,
    clearStoryboard,
    customCameraPrompt,
    frames,
    handleGenerateStoryboard,
    hasInterpolationModel: storyboardModels.length > 0,
    isStoryboardGenerating,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setFrames,
  };
}
