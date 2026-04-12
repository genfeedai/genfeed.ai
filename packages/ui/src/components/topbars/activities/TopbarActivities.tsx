'use client';

import { useIngredientOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection-context';
import { useBackgroundTaskContext } from '@genfeedai/contexts/ui/background-task-context';
import {
  ActivityKey,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  IngredientCategory,
} from '@genfeedai/enums';
import { getPublisherPostsHref } from '@genfeedai/helpers/content/posts.helper';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useActivities } from '@genfeedai/hooks/data/activities/use-activities/use-activities';
import { playAudio } from '@genfeedai/hooks/media/audio-utils/audio.utils';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useBackgroundTasks } from '@genfeedai/hooks/utils/use-background-tasks/use-background-tasks';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type {
  IActivity,
  IActivityPopulated,
  IBackgroundTask,
  IIngredient,
} from '@genfeedai/interfaces';
import type { IGenerationItem } from '@genfeedai/interfaces/components/generation.interface';
import type { UnifiedActivityItem } from '@genfeedai/interfaces/components/topbar-activities.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import {
  Button,
  buttonVariants,
  Button as PrimitiveButton,
} from '@ui/primitives/button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiArrowPath,
  HiBell,
  HiCheck,
  HiFilm,
  HiPlay,
  HiXMark,
} from 'react-icons/hi2';

const FIVE_SECONDS_MS = 5_000;
const ONE_MINUTE_MS = 60_000;

// Background task keys that get special rendering
const BACKGROUND_TASK_KEYS = [
  // Video lifecycle
  ActivityKey.VIDEO_PROCESSING,
  ActivityKey.VIDEO_GENERATED,
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_FAILED,
  // Image lifecycle
  ActivityKey.IMAGE_PROCESSING,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.IMAGE_FAILED,
  // Music lifecycle
  ActivityKey.MUSIC_PROCESSING,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.MUSIC_FAILED,
  // Post lifecycle
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_CREATED,
  ActivityKey.POST_SCHEDULED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.POST_FAILED,
  // Model training lifecycle
  ActivityKey.MODELS_TRAINING_CREATED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.MODELS_TRAINING_FAILED,
  // Article lifecycle
  ActivityKey.ARTICLE_PROCESSING,
  ActivityKey.ARTICLE_GENERATED,
  ActivityKey.ARTICLE_FAILED,
];

// Parse activity value JSON safely
function parseActivityValue(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Check if activity is a background task (merge, generation, post, etc.)
function isBackgroundTask(activity: IActivity): boolean {
  return BACKGROUND_TASK_KEYS.includes(activity.key as ActivityKey);
}

// Activity key groupings for task type detection
const VIDEO_KEYS = [
  ActivityKey.VIDEO_PROCESSING,
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_FAILED,
];
const IMAGE_KEYS = [
  ActivityKey.IMAGE_PROCESSING,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.IMAGE_FAILED,
];
const MUSIC_KEYS = [
  ActivityKey.MUSIC_PROCESSING,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.MUSIC_FAILED,
];
const POST_KEYS = [
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_CREATED,
  ActivityKey.POST_SCHEDULED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.POST_FAILED,
];
const TRAINING_KEYS = [
  ActivityKey.MODELS_TRAINING_CREATED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.MODELS_TRAINING_FAILED,
];
const ARTICLE_KEYS = [
  ActivityKey.ARTICLE_PROCESSING,
  ActivityKey.ARTICLE_GENERATED,
  ActivityKey.ARTICLE_FAILED,
];

// Get task type from activity key
function getTaskType(
  activity: IActivity,
): 'merge' | 'generation' | 'post' | 'training' | 'unknown' {
  const key = activity.key as ActivityKey;

  if (VIDEO_KEYS.includes(key)) {
    const parsed = parseActivityValue(activity.value);
    return parsed?.type === 'merge' ? 'merge' : 'generation';
  }

  if (
    IMAGE_KEYS.includes(key) ||
    MUSIC_KEYS.includes(key) ||
    ARTICLE_KEYS.includes(key)
  ) {
    return 'generation';
  }

  if (POST_KEYS.includes(key)) {
    return 'post';
  }

  if (TRAINING_KEYS.includes(key)) {
    return 'training';
  }

  return 'unknown';
}

// Status mappings for activity keys
const COMPLETED_KEYS = new Set([
  ActivityKey.VIDEO_COMPLETED,
  ActivityKey.VIDEO_GENERATED,
  ActivityKey.IMAGE_GENERATED,
  ActivityKey.MUSIC_GENERATED,
  ActivityKey.POST_GENERATED,
  ActivityKey.POST_PUBLISHED,
  ActivityKey.MODELS_TRAINING_COMPLETED,
  ActivityKey.ARTICLE_GENERATED,
]);

const FAILED_KEYS = new Set([
  ActivityKey.VIDEO_FAILED,
  ActivityKey.IMAGE_FAILED,
  ActivityKey.MUSIC_FAILED,
  ActivityKey.POST_FAILED,
  ActivityKey.MODELS_TRAINING_FAILED,
  ActivityKey.ARTICLE_FAILED,
]);

// Get background task status from activity key
function getBackgroundTaskStatus(
  key: string,
): 'processing' | 'completed' | 'failed' {
  if (COMPLETED_KEYS.has(key as ActivityKey)) {
    return 'completed';
  }
  if (FAILED_KEYS.has(key as ActivityKey)) {
    return 'failed';
  }
  return 'processing';
}

// Get result type (category) from activity key
function getResultTypeFromActivityKey(
  key: string,
): IngredientCategory | undefined {
  if (VIDEO_KEYS.includes(key as ActivityKey)) {
    return IngredientCategory.VIDEO;
  }
  if (IMAGE_KEYS.includes(key as ActivityKey)) {
    return IngredientCategory.IMAGE;
  }
  if (MUSIC_KEYS.includes(key as ActivityKey)) {
    return IngredientCategory.MUSIC;
  }
  return undefined;
}

// Get default label for a task based on its type and activity key
function getTaskLabel(
  activity: IActivity,
  taskType: ReturnType<typeof getTaskType>,
  parsed: Record<string, unknown> | null,
): string {
  const key = activity.key as ActivityKey;

  switch (taskType) {
    case 'merge':
      return 'Video Merge';

    case 'generation': {
      if (IMAGE_KEYS.includes(key)) {
        return 'Image Generation';
      }
      if (VIDEO_KEYS.includes(key)) {
        return 'Video Generation';
      }
      if (MUSIC_KEYS.includes(key)) {
        return 'Music Generation';
      }
      if (ARTICLE_KEYS.includes(key)) {
        return 'Article Generation';
      }
      return 'Content Generation';
    }

    case 'post': {
      const populatedActivity = activity as IActivityPopulated;
      const postDescription =
        populatedActivity.post?.description ||
        parsed?.description ||
        parsed?.sentence ||
        null;
      return (
        extractPostDescription(postDescription as string | null) ||
        'Post Publishing'
      );
    }

    case 'training':
      return 'Model Training';

    default:
      return 'Background Task';
  }
}

// Extract and truncate post description for display
function extractPostDescription(
  description: string | undefined | null,
  maxLength: number = 60,
): string | null {
  if (!description) {
    return null;
  }

  // Strip HTML tags
  const textOnly = description.replace(/<[^>]*>/g, '').trim();

  if (!textOnly) {
    return null;
  }

  // Truncate if needed
  if (textOnly.length <= maxLength) {
    return textOnly;
  }

  // Truncate at word boundary if possible
  const truncated = textOnly.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    // If we can find a space reasonably close to the end, use it
    return `${truncated.substring(0, lastSpace)}...`;
  }

  return `${truncated}...`;
}

function formatEtaDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatEtaRange(durationMs: number): string {
  const lowerBound = Math.max(FIVE_SECONDS_MS, Math.round(durationMs * 0.7));
  const upperBound = Math.round(durationMs * 1.35);

  if (upperBound < ONE_MINUTE_MS) {
    return `${Math.round(lowerBound / 1000)}-${Math.round(upperBound / 1000)}s`;
  }

  return `${Math.round(lowerBound / ONE_MINUTE_MS)}-${Math.round(
    upperBound / ONE_MINUTE_MS,
  )} min`;
}

function getTaskEtaLabel(task: IBackgroundTask): string | null {
  if (!task.estimatedDurationMs) {
    return null;
  }

  if (task.etaConfidence === 'low') {
    return `Usually ${formatEtaRange(task.estimatedDurationMs)}`;
  }

  return `About ${formatEtaDuration(
    task.remainingDurationMs ?? task.estimatedDurationMs,
  )} left`;
}

function getTaskElapsedLabel(task: IBackgroundTask): string | null {
  if (!task.startedAt) {
    return null;
  }

  const startedAtMs = new Date(task.startedAt).getTime();
  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  return formatEtaDuration(Math.max(1_000, Date.now() - startedAtMs));
}

export default function TopbarActivities() {
  const { activeGenerations } = useAssetSelection();
  const { removeTask, tasks: realtimeTasks } = useBackgroundTaskContext();
  const {
    filteredActivities,
    refresh,
    markActivitiesAsRead,
    clearCompletedActivities,
  } = useActivities({
    autoLoad: true, // Load activities on mount to show badge count
  });

  const router = useRouter();
  const { href } = useOrgUrl();
  const { openIngredientOverlay } = useIngredientOverlay();
  const notificationsService = NotificationsService.getInstance();
  const { subscribe, isReady } = useSocketManager();
  useBackgroundTasks();

  const [isHydrated, setIsHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingTaskId, _setLoadingTaskId] = useState<string | null>(null);
  const [failedPreviews, setFailedPreviews] = useState<Set<string>>(new Set());

  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);
  const pendingRefreshRef = useRef(false);

  const hasActiveGenerations = activeGenerations.length > 0;
  const activeRealtimeTasks = useMemo(
    () =>
      realtimeTasks.filter(
        (task) => task.status === 'pending' || task.status === 'processing',
      ),
    [realtimeTasks],
  );
  const hasRealtimeTasks = realtimeTasks.length > 0;
  const hasAllRealtimeTasksDone = useMemo(
    () =>
      hasRealtimeTasks &&
      activeRealtimeTasks.length === 0 &&
      realtimeTasks.every(
        (task) => task.status === 'completed' || task.status === 'failed',
      ),
    [activeRealtimeTasks.length, hasRealtimeTasks, realtimeTasks],
  );

  // Check for processing background tasks (exclude already-read ones from badge count)
  const processingBackgroundTasks = useMemo(
    () =>
      filteredActivities.filter(
        (a) =>
          isBackgroundTask(a) &&
          !a.isRead &&
          getBackgroundTaskStatus(a.key) === 'processing',
      ),
    [filteredActivities],
  );
  const hasProcessingTasks = processingBackgroundTasks.length > 0;

  // Calculate unread activities count
  const unreadCount = useMemo(() => {
    return filteredActivities.filter((a) => !a.isRead).length;
  }, [filteredActivities]);

  // IDs of completed background tasks (for "Clear completed" button)
  const completedBackgroundTaskIds = useMemo(
    () =>
      filteredActivities
        .filter(
          (a) =>
            isBackgroundTask(a) &&
            getBackgroundTaskStatus(a.key) === 'completed',
        )
        .map((a) => a.id),
    [filteredActivities],
  );

  // Merge and sort activities chronologically
  const unifiedItems = useMemo(() => {
    const generationItems: UnifiedActivityItem[] = activeGenerations.map(
      (gen) => ({
        data: gen,
        id: gen.id,
        timestamp: new Date(gen.startTime),
        type: 'generation' as const,
      }),
    );

    // Separate background tasks from regular activities
    const backgroundTaskItems: UnifiedActivityItem[] = filteredActivities
      .filter((act) => isBackgroundTask(act))
      .map((act) => ({
        data: act,
        id: act.id,
        timestamp: new Date(act.createdAt),
        type: 'background-task' as const,
      }));

    const regularActivityItems: UnifiedActivityItem[] = filteredActivities
      .filter((act) => !isBackgroundTask(act))
      .map((act) => ({
        data: act,
        id: act.id,
        timestamp: new Date(act.createdAt),
        type: 'activity' as const,
      }));

    // Merge and sort by timestamp (newest first)
    return [
      ...generationItems,
      ...backgroundTaskItems,
      ...regularActivityItems,
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [activeGenerations, filteredActivities]);

  // Debounced refresh function to prevent rapid successive calls
  const debouncedRefresh = useCallback(() => {
    // Clear any pending timeout — events coalesce by resetting the timer
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Debounce refresh calls by 500ms
    refreshTimeoutRef.current = setTimeout(async () => {
      // If already refreshing, queue a follow-up instead of dropping
      if (isRefreshingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      isRefreshingRef.current = true;
      try {
        await refresh();
      } finally {
        isRefreshingRef.current = false;
        // If events arrived during the API call, trigger another refresh
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          debouncedRefresh();
        }
      }
    }, 500);
  }, [refresh]);

  // WebSocket subscription for real-time updates - refresh activities from API
  useEffect(() => {
    if (!isReady) {
      return;
    }

    const handleMediaUpdate = () => {
      debouncedRefresh();
    };

    const unsubscribeVideoComplete = subscribe('video-complete', () => {
      playAudio('/sounds/task-complete.mp3');
      debouncedRefresh();
    });
    const unsubscribeVideoProgress = subscribe(
      'video-progress',
      handleMediaUpdate,
    );
    const unsubscribeMediaFailed = subscribe('media-failed', handleMediaUpdate);

    return () => {
      unsubscribeVideoComplete();
      unsubscribeVideoProgress();
      unsubscribeMediaFailed();
      // Cleanup timeout on unmount
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [isReady, subscribe, debouncedRefresh]);

  // Polling fallback: refresh every 30s when dropdown is open or tasks are processing
  useEffect(() => {
    if (!isOpen && !hasProcessingTasks) {
      return;
    }

    const intervalId = setInterval(() => {
      if (!isRefreshingRef.current) {
        refresh();
      }
    }, 30_000);

    return () => clearInterval(intervalId);
  }, [isOpen, hasProcessingTasks, refresh]);

  // Helper to get preview URL from populated ingredient
  const getPreviewUrl = useCallback(
    (
      ingredient: IIngredient | undefined,
      category: IngredientCategory,
    ): string | undefined => {
      if (!ingredient) {
        return undefined;
      }

      if (category === IngredientCategory.VIDEO) {
        // For videos, prefer thumbnailUrl from ingredient, fallback to CDN pattern
        if (ingredient.thumbnailUrl) {
          return ingredient.thumbnailUrl;
        }
      } else if (category === IngredientCategory.IMAGE) {
        // For images, use ingredientUrl
        if (ingredient.ingredientUrl) {
          return ingredient.ingredientUrl;
        } else if (ingredient.thumbnailUrl) {
          // Fallback to thumbnailUrl if ingredientUrl is not available
          return ingredient.thumbnailUrl;
        }
      }

      return undefined;
    },
    [],
  );

  useEffect(() => {
    if (isOpen) {
      // Refresh activities when dropdown is opened (only once, not debounced)
      refresh();
    }
    // Only refresh when dropdown opens, not when refresh function changes
  }, [
    isOpen, // Refresh activities when dropdown is opened (only once, not debounced)
    refresh,
  ]);

  const navigateToStudio = () => {
    setIsOpen(false);
    router.push(href('/studio'));
  };

  const navigateToActivities = () => {
    setIsOpen(false);
    router.push(href('/overview/activities'));
  };

  const navigateToPublisherArticles = useCallback(
    (articleId?: string | null) => {
      setIsOpen(false);
      const target = articleId
        ? `${COMPOSE_ROUTES.ARTICLE}?id=${articleId}`
        : COMPOSE_ROUTES.ARTICLE;
      window.location.href = `${EnvironmentService.apps.app}${target}`;
    },
    [],
  );

  const handleMarkAllRead = async () => {
    await markActivitiesAsRead(); // No IDs = mark all unread
  };

  const handleClearCompleted = async () => {
    await clearCompletedActivities(completedBackgroundTaskIds);
  };

  // Handle click on background task to open ingredient modal
  const handleBackgroundTaskClick = useCallback(
    (activity: IActivity) => {
      const parsed = parseActivityValue(activity.value);
      const status = getBackgroundTaskStatus(activity.key);

      if (status === 'processing') {
        notificationsService.info('Task is still processing...');
        return;
      }

      if (status === 'failed') {
        const errorMsg =
          (parsed?.error as string) || 'Task failed. Please try again.';
        notificationsService.error(errorMsg);
        return;
      }

      const activityHref = parsed?.href as string | undefined;
      if (activityHref) {
        setIsOpen(false);
        router.push(href(activityHref));
        return;
      }

      // Status is 'completed' - open the ingredient modal or navigate
      const resultId = parsed?.resultId as string;
      const taskType = getTaskType(activity);

      // For posts, navigate to posts page instead of opening modal
      if (taskType === 'post') {
        setIsOpen(false);
        router.push(href(getPublisherPostsHref()));
        return;
      }

      // For training, navigate to training/models page
      if (taskType === 'training') {
        setIsOpen(false);
        router.push(href('/studio/models'));
        return;
      }

      // For articles, navigate to articles page (articles aren't ingredients)
      if (
        activity.key === ActivityKey.ARTICLE_GENERATED ||
        activity.key === ActivityKey.ARTICLE_PROCESSING ||
        activity.key === ActivityKey.ARTICLE_FAILED
      ) {
        navigateToPublisherArticles(resultId);
        return;
      }

      // Try to use populated ingredient if available (avoid additional API call)
      const populatedActivity = activity as IActivityPopulated;
      if (populatedActivity.ingredient?.id) {
        // Close dropdown first, then open modal with populated ingredient
        setIsOpen(false);
        setTimeout(() => {
          openIngredientOverlay(populatedActivity.ingredient as IIngredient);
        }, 100);
        return;
      }

      // Fallback: fetch ingredient if not populated (shouldn't happen with new lookup, but handle gracefully)
      if (!resultId) {
        notificationsService.error('No result available');
        return;
      }

      notificationsService.info('Loading ingredient details...');
    },
    [
      notificationsService,
      openIngredientOverlay,
      navigateToPublisherArticles,
      router,
      href,
    ],
  );

  const handleItemClick = (item: UnifiedActivityItem) => {
    if (item.type === 'generation') {
      navigateToStudio();
    } else if (item.type === 'background-task') {
      handleBackgroundTaskClick(item.data as IActivity);
    } else {
      navigateToActivities();
    }
  };

  const renderBackgroundTask = (activity: IActivity) => {
    const parsed = parseActivityValue(activity.value);
    const status = getBackgroundTaskStatus(activity.key);
    const taskType = getTaskType(activity);

    // Generate label based on task type and activity key
    const label =
      (parsed?.label as string) || getTaskLabel(activity, taskType, parsed);

    const progress = parsed?.progress as number | undefined;
    const _resultId = parsed?.resultId as string | undefined;
    const resultType =
      (parsed?.resultType as IngredientCategory) ||
      getResultTypeFromActivityKey(activity.key) ||
      IngredientCategory.VIDEO;
    const isLoading = loadingTaskId === activity.id;

    // Get preview from populated ingredient data
    let preview: { url: string; category: IngredientCategory } | undefined;
    const populatedActivity = activity as IActivityPopulated;
    if (populatedActivity.ingredient && resultType) {
      const previewUrl = getPreviewUrl(
        populatedActivity.ingredient,
        resultType,
      );
      if (previewUrl) {
        preview = { category: resultType, url: previewUrl };
      }
    }
    if (
      !preview &&
      status === 'completed' &&
      typeof parsed?.mediaUrl === 'string'
    ) {
      preview = {
        category: resultType ?? IngredientCategory.IMAGE,
        url: parsed.mediaUrl,
      };
    }

    // Status icon - only for processing and failed (not completed)
    const statusIcon = (() => {
      if (isLoading) {
        return (
          <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        );
      }
      switch (status) {
        case 'processing':
          return activity.isRead ? null : (
            <HiBell className="h-4 w-4 animate-pulse text-primary" />
          );
        case 'failed':
          return <HiXMark className="h-4 w-4 text-error" />;
        case 'completed':
          return null;
      }
    })();

    // Badge configuration based on status
    const statusBadgeConfig = {
      completed: { label: 'Ready', variant: 'success' as const },
      failed: { label: 'Failed', variant: 'error' as const },
      processing: { label: 'Processing', variant: 'primary' as const },
    };

    const badgeConfig = statusBadgeConfig[status];
    const statusBadge = (
      <Badge variant={badgeConfig.variant} size={ComponentSize.SM}>
        {badgeConfig.label}
      </Badge>
    );

    return (
      <div key={activity.id} className="w-full">
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={() => handleBackgroundTaskClick(activity)}
          isDisabled={isLoading}
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
            'font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90',
            'hover:bg-background/60 focus:bg-background/60 focus:outline-none',
            status === 'completed' && 'cursor-pointer',
            status === 'processing' && 'cursor-wait',
          )}
        >
          {/* Square Preview Image/Thumbnail */}
          {preview &&
          status === 'completed' &&
          !failedPreviews.has(activity.id) ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden bg-background">
              <Image
                src={preview.url}
                alt={label}
                fill
                className="object-cover"
                sizes="48px"
                unoptimized
                onError={() => {
                  // Mark this preview as failed so we show placeholder instead
                  setFailedPreviews((prev) => new Set(prev).add(activity.id));
                }}
              />
              {preview.category === IngredientCategory.VIDEO && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <HiPlay className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
          ) : (
            <div className="h-12 w-12 shrink-0 bg-background flex items-center justify-center">
              <HiFilm className="h-5 w-5 text-foreground/40" />
            </div>
          )}

          {/* Content Section */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Label and Status Icon */}
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm font-medium">
                {label}
              </span>
              {statusIcon && <span className="shrink-0">{statusIcon}</span>}
            </div>

            {/* Progress Bar */}
            {status === 'processing' && progress !== undefined && (
              <div className="w-full">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground/60">Progress</span>
                  <span className="text-xs font-medium text-foreground/80">
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Indeterminate progress spinner for processing without progress */}
            {status === 'processing' && progress === undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-foreground/60">
                  Processing...
                </span>
                <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            )}

            {/* Status Badge and Timestamp */}
            <div className="flex items-center justify-between gap-2">
              {statusBadge}
              <span className="text-xs text-foreground/50 shrink-0">
                {new Date(activity.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </Button>
      </div>
    );
  };

  const renderItem = (item: UnifiedActivityItem) => {
    if (item.type === 'generation') {
      const generation = item.data as IGenerationItem;
      return (
        <div key={item.id} className="w-full">
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => handleItemClick(item)}
            className={cn(
              'flex w-full flex-col items-start gap-1.5 px-3 py-2 text-left text-sm',
              'font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90',
              'hover:bg-background/60 focus:bg-background/60 focus:outline-none',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="capitalize">{generation.type} generation</span>
              <Badge variant="primary" size={ComponentSize.SM}>
                Active
              </Badge>
            </div>
            {generation.prompt && (
              <span className="w-full truncate text-xs text-foreground/60">
                {generation.prompt}
              </span>
            )}
          </Button>
        </div>
      );
    } else if (item.type === 'background-task') {
      return renderBackgroundTask(item.data as IActivity);
    } else {
      const activity = item.data as IActivity;
      return (
        <div key={item.id} className="w-full">
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => handleItemClick(item)}
            className={cn(
              'flex w-full items-center justify-between gap-2',
              'px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
              'text-foreground/70 hover:text-foreground/90 hover:bg-background/60 focus:bg-background/60 focus:outline-none min-h-[2.5rem]',
            )}
          >
            <span className="flex-1">
              {activity.label || `${activity.key}: ${activity.value}`}
            </span>

            <span className="text-xs text-foreground/60">
              {new Date(activity.createdAt).toLocaleDateString()}
            </span>
          </Button>
        </div>
      );
    }
  };

  const handleRealtimeTaskClick = useCallback(
    (task: IBackgroundTask) => {
      if (task.status === 'pending' || task.status === 'processing') {
        notificationsService.info('Task is still processing...');
        return;
      }

      if (task.status === 'failed') {
        notificationsService.error(task.error || 'Task failed');
        return;
      }

      setIsOpen(false);
      removeTask(task.id);

      if (task.resultType === 'WORKFLOW') {
        router.push(href(`/workflows/executions/${task.resultId ?? task.id}`));
        return;
      }

      if (task.resultType) {
        router.push(href('/studio'));
        return;
      }

      router.push(href('/overview/activities'));
    },
    [notificationsService, removeTask, router, href],
  );

  const renderRealtimeTask = (task: IBackgroundTask) => {
    const isProcessing =
      task.status === 'pending' || task.status === 'processing';
    const etaLabel = getTaskEtaLabel(task);
    const elapsedLabel = getTaskElapsedLabel(task);
    const badgeVariant: 'success' | 'error' | 'primary' =
      task.status === 'completed'
        ? 'success'
        : task.status === 'failed'
          ? 'error'
          : 'primary';

    return (
      <Button
        key={task.id}
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        onClick={() => handleRealtimeTaskClick(task)}
        className={cn(
          'flex w-full flex-col items-start gap-2 px-3 py-2 text-left text-sm',
          'font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90',
          'hover:bg-background/60 focus:bg-background/60 focus:outline-none',
          isProcessing && 'cursor-wait',
        )}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate">{task.title}</span>
          {task.status === 'completed' ? (
            <HiCheck className="h-4 w-4 text-success" />
          ) : task.status === 'failed' ? (
            <HiXMark className="h-4 w-4 text-error" />
          ) : (
            <HiArrowPath className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>

        {isProcessing && (
          <div className="w-full">
            {task.currentPhase && (
              <div className="mb-1 text-xs text-foreground/60">
                {task.currentPhase}
              </div>
            )}
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-foreground/60">Progress</span>
              <span className="text-xs font-medium text-foreground/80">
                {Math.round(task.progress)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            {(etaLabel || elapsedLabel) && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-foreground/60">
                <span>{etaLabel ?? 'Processing...'}</span>
                {elapsedLabel && <span>Elapsed {elapsedLabel}</span>}
              </div>
            )}
            {(task.remainingDurationMs ?? task.estimatedDurationMs ?? 0) >=
              60_000 && (
              <div className="mt-2 text-xs text-foreground/50">
                You can keep working. We’ll notify you when it’s ready.
              </div>
            )}
          </div>
        )}

        {!isProcessing && elapsedLabel && (
          <div className="text-xs text-foreground/60">
            {task.status === 'completed'
              ? `Completed in ${elapsedLabel}`
              : `Failed after ${elapsedLabel}`}
          </div>
        )}

        <div className="flex w-full items-center justify-between gap-2">
          <Badge variant={badgeVariant} size={ComponentSize.SM}>
            {task.status === 'pending'
              ? 'Pending'
              : task.status === 'processing'
                ? 'Processing'
                : task.status === 'completed'
                  ? 'Ready'
                  : 'Failed'}
          </Badge>
          <span className="text-xs text-foreground/50 shrink-0">
            {new Date(task.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </Button>
    );
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const triggerButton = (
    <PrimitiveButton
      aria-label={
        hasActiveGenerations ||
        hasProcessingTasks ||
        activeRealtimeTasks.length > 0
          ? `${activeGenerations.length + processingBackgroundTasks.length + activeRealtimeTasks.length} active task${activeGenerations.length + processingBackgroundTasks.length + activeRealtimeTasks.length > 1 ? 's' : ''}`
          : 'View activities'
      }
      className={cn(
        buttonVariants({
          size: ButtonSize.ICON,
          variant: ButtonVariant.GHOST,
        }),
        'relative flex h-9 w-9 items-center justify-center p-2 min-h-0 m-0 transition-colors duration-150',
        hasActiveGenerations ||
          hasProcessingTasks ||
          activeRealtimeTasks.length > 0
          ? 'text-primary hover:bg-background/60'
          : 'text-foreground/70 hover:text-foreground/90 hover:bg-background/60',
      )}
      type="button"
    >
      {(() => {
        if (activeRealtimeTasks.length > 0) {
          return (
            <Badge
              variant="error"
              size={ComponentSize.SM}
              className="absolute -right-1 -top-1 w-5 animate-pulse flex items-center justify-center"
            >
              {activeRealtimeTasks.length}
            </Badge>
          );
        }

        if (hasAllRealtimeTasksDone) {
          return (
            <Badge
              variant="success"
              size={ComponentSize.SM}
              className="absolute -right-1 -top-1 w-5 flex items-center justify-center"
            >
              <HiCheck className="h-3 w-3" />
            </Badge>
          );
        }

        const totalCount =
          activeGenerations.length + processingBackgroundTasks.length;

        if (totalCount === 0) {
          return null;
        }

        return (
          <Badge
            variant="error"
            size={ComponentSize.SM}
            className="absolute -right-1 -top-1 w-5 animate-pulse flex items-center justify-center"
          >
            {totalCount}
          </Badge>
        );
      })()}

      <HiBell
        aria-hidden="true"
        className={cn('h-5 w-5 transition-colors text-current')}
      />
    </PrimitiveButton>
  );

  if (!isHydrated) {
    return triggerButton;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>

      <PopoverPanelContent align="end" className="w-80 p-0">
        <div className="border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Activities</span>
          <div className="flex items-center gap-2">
            {completedBackgroundTaskIds.length > 0 && (
              <Button
                withWrapper={false}
                variant={ButtonVariant.GHOST}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearCompleted();
                }}
                className="flex h-7 w-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
                ariaLabel="Clear completed tasks"
              >
                <HiXMark className="h-4 w-4" />
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                withWrapper={false}
                variant={ButtonVariant.GHOST}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAllRead();
                }}
                className="flex h-7 w-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
                ariaLabel="Mark all as read"
              >
                <HiCheck className="h-4 w-4" />
              </Button>
            )}
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              onClick={(e) => {
                e.stopPropagation();
                refresh();
              }}
              className="flex h-7 w-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
              ariaLabel="Refresh activities"
            >
              <HiArrowPath className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-60 w-full overflow-y-auto overflow-x-hidden">
          <div className="w-full space-y-1 p-2">
            {realtimeTasks.length > 0 && (
              <>
                {realtimeTasks
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime(),
                  )
                  .map((task) => renderRealtimeTask(task))}
                <div className="border-t border-white/[0.08] my-1" />
              </>
            )}

            {unifiedItems.length === 0 ? (
              <div className="w-full px-3 py-3 text-sm text-foreground/70">
                No activities yet
              </div>
            ) : (
              unifiedItems.map((item) => renderItem(item))
            )}
          </div>
        </div>

        <div className="border-t border-white/[0.08] p-2 space-y-2">
          {hasActiveGenerations && (
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              className="w-full px-3 py-2 text-sm font-medium transition-colors duration-150 text-foreground/70 hover:text-foreground/90 hover:bg-background/60"
              onClick={navigateToStudio}
            >
              Go to Studio
            </Button>
          )}

          <Link
            href={href('/overview/activities')}
            className="inline-flex items-center justify-center border border-white/[0.08] bg-white/[0.05] text-foreground/70 hover:text-foreground/90 hover:bg-white/[0.08] h-9 px-4 py-2 text-sm font-medium w-full no-underline transition-colors duration-150"
            onClick={() => setIsOpen(false)}
          >
            View all activities
          </Link>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
