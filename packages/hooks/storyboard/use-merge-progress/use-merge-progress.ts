import type { MergeProgressStep } from '@props/studio/merge.props';
import { logger } from '@services/core/logger.service';
import { SocketManager } from '@services/core/socket-manager.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface JobProgress {
  percent: number;
  step?:
    | 'downloading'
    | 'downloading-music'
    | 'merging'
    | 'resizing'
    | 'uploading';
  stepProgress?: number;
  currentStepLabel?: string;
  totalSteps?: number;
}

// Map backend step names to frontend step IDs
const backendToFrontendStep: Record<string, string> = {
  downloading: 'download',
  'downloading-music': 'download-music',
  merging: 'merge',
  resizing: 'resize',
  uploading: 'upload',
};

interface VideoProgressEvent {
  path: string;
  progress: JobProgress;
  userId?: string;
  room?: string;
}

interface PathBasedWebSocketEvent {
  status: 'processing' | 'completed' | 'success' | 'failed';
  progress?: JobProgress;
  error?: string;
}

interface UseMergeProgressOptions {
  ingredientId?: string;
  hasMusic?: boolean;
  hasResize?: boolean;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

/**
 * Hook to track merge progress from WebSocket events
 * Maps backend step-based progress to MergeProgressStep array
 */
export function useMergeProgress({
  ingredientId,
  hasMusic = false,
  hasResize = false,
  onComplete,
  onError,
}: UseMergeProgressOptions) {
  // Compute initial steps structure based on configuration
  const initialSteps = useMemo<MergeProgressStep[]>(() => {
    if (!ingredientId) {
      return [];
    }

    const steps: MergeProgressStep[] = [
      {
        id: 'download',
        label: 'Downloading videos',
        status: 'pending',
      },
    ];

    if (hasMusic) {
      steps.push({
        id: 'download-music',
        label: 'Downloading music',
        status: 'pending',
      });
    }

    steps.push({
      id: 'merge',
      label: 'Merging videos',
      status: 'pending',
    });

    if (hasResize) {
      steps.push({
        id: 'resize',
        label: 'Resizing video',
        status: 'pending',
      });
    }

    steps.push({
      id: 'upload',
      label: 'Uploading result',
      status: 'pending',
    });

    return steps;
  }, [ingredientId, hasMusic, hasResize]);

  const [steps, setSteps] = useState<MergeProgressStep[]>(initialSteps);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const prevIngredientIdRef = useRef<string | undefined>(ingredientId);

  // Store callbacks in refs to avoid dependency issues
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change (doesn't trigger re-render)
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  /**
   * Update steps based on backend progress event
   */
  const updateProgress = useCallback((progress: JobProgress) => {
    // Update overall progress
    if (progress.percent !== undefined) {
      setOverallProgress(progress.percent);
    }

    setSteps((currentSteps) => {
      const newSteps = [...currentSteps];
      const stepMap: Record<string, number> = {};

      // Map step IDs to indices
      newSteps.forEach((step, index) => {
        stepMap[step.id] = index;
      });

      // Update based on current step
      if (progress.step) {
        // Map backend step name to frontend step ID
        const frontendStepId =
          backendToFrontendStep[progress.step] || progress.step;
        const stepIndex = stepMap[frontendStepId];
        if (stepIndex !== undefined) {
          // Mark all previous steps as completed
          for (let i = 0; i < stepIndex; i++) {
            if (newSteps[i].status !== 'completed') {
              newSteps[i] = { ...newSteps[i], status: 'completed' };
            }
          }

          // Update current step
          if (progress.stepProgress !== undefined) {
            newSteps[stepIndex] = {
              ...newSteps[stepIndex],
              label: progress.currentStepLabel || newSteps[stepIndex].label,
              progress: progress.stepProgress,
              status: 'active',
            };
          } else {
            newSteps[stepIndex] = {
              ...newSteps[stepIndex],
              label: progress.currentStepLabel || newSteps[stepIndex].label,
              status: 'active',
            };
          }

          // Mark all future steps as pending
          for (let i = stepIndex + 1; i < newSteps.length; i++) {
            if (newSteps[i].status !== 'pending') {
              newSteps[i] = { ...newSteps[i], status: 'pending' };
            }
          }
        }
      }

      return newSteps;
    });
  }, []);

  /**
   * Mark all steps as completed
   */
  const markComplete = useCallback(() => {
    setOverallProgress(100);
    setSteps((currentSteps) =>
      currentSteps.map((step) => ({
        ...step,
        progress: 100,
        status: 'completed' as const,
      })),
    );
    onCompleteRef.current?.();
  }, []);

  /**
   * Mark current step as failed
   */
  const markFailed = useCallback((error?: string) => {
    setSteps((currentSteps) => {
      const newSteps = [...currentSteps];
      const activeIndex = newSteps.findIndex((s) => s.status === 'active');
      if (activeIndex !== -1) {
        newSteps[activeIndex] = {
          ...newSteps[activeIndex],
          status: 'failed',
        };
      }
      return newSteps;
    });
    if (error) {
      onErrorRef.current?.(error);
    }
  }, []);

  useEffect(() => {
    const ingredientIdChanged = prevIngredientIdRef.current !== ingredientId;

    if (ingredientIdChanged) {
      prevIngredientIdRef.current = ingredientId;
      setOverallProgress(0);
    }

    // Update steps only when necessary, using functional update to check current state
    setSteps((prevSteps) => {
      if (!ingredientId) {
        // Clear steps when ingredientId is removed
        return prevSteps.length > 0 ? [] : prevSteps;
      }

      // Initialize or update steps when ingredientId exists
      if (ingredientIdChanged || prevSteps.length === 0) {
        return initialSteps;
      }

      // Configuration might have changed, check if update is needed
      if (
        prevSteps.length !== initialSteps.length ||
        prevSteps.some((step, i) => step.id !== initialSteps[i]?.id)
      ) {
        return initialSteps;
      }

      return prevSteps;
    });

    // Don't set up subscriptions if no ingredientId
    if (!ingredientId) {
      return;
    }

    // Subscribe to WebSocket events
    const socketManager = SocketManager.getInstance();
    const websocketPath = `/videos/${ingredientId}`;

    logger.info('useMergeProgress: Subscribing to WebSocket events', {
      ingredientId,
      websocketPath,
    });

    const unsubscribePath = socketManager.subscribe<PathBasedWebSocketEvent>(
      websocketPath,
      (data) => {
        logger.info('useMergeProgress: Received path-based event', {
          hasProgress: !!data.progress,
          path: websocketPath,
          progressKeys: data.progress ? Object.keys(data.progress) : [],
          status: data.status,
          step: data.progress?.step,
          stepProgress: data.progress?.stepProgress,
        });

        if (data.status === 'processing' && data.progress) {
          const progressData = data.progress;
          if (progressData.step) {
            updateProgress(progressData);
          } else if (progressData.percent !== undefined) {
            logger.error(
              'useMergeProgress: Received percent-only progress, cannot map to steps',
              { percent: progressData.percent },
            );
          }
        } else if (data.status === 'completed' || data.status === 'success') {
          markComplete();
        } else if (data.status === 'failed' || data.error) {
          markFailed(data.error);
        }
      },
    );

    const unsubscribeProgress = socketManager.subscribe<VideoProgressEvent>(
      'video-progress',
      (data) => {
        logger.info('useMergeProgress: Received video-progress event', {
          eventPath: data.path,
          progress: data.progress,
          websocketPath,
        });

        // Only process events for this specific video
        if (data.path === websocketPath) {
          updateProgress(data.progress);
        }
      },
    );

    // Subscribe to video-complete for success/error
    const unsubscribeComplete = socketManager.subscribe<{
      path: string;
      result?: any;
      error?: string;
    }>('video-complete', (data) => {
      logger.info('useMergeProgress: Received video-complete event', {
        eventPath: data.path,
        hasError: !!data.error,
        websocketPath,
      });

      if (data.path === websocketPath) {
        if (data.error) {
          markFailed(data.error);
        } else {
          markComplete();
        }
      }
    });

    return () => {
      unsubscribePath();
      unsubscribeProgress();
      unsubscribeComplete();
    };
  }, [ingredientId, initialSteps, updateProgress, markComplete, markFailed]);

  return {
    overallProgress,
    steps,
  };
}
