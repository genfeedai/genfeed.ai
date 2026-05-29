'use client';

import { useIngredientOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection.context';
import { useBackgroundTaskContext } from '@genfeedai/contexts/ui/background-task-context';
import {
  ActivityKey,
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
import ClientDateTime from '@ui/components/time/ClientDateTime';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiArrowPath, HiCheck, HiXMark } from 'react-icons/hi2';
import ActivitiesTriggerButton from './ActivitiesTriggerButton';
import {
  getBackgroundTaskStatus,
  getResultTypeFromActivityKey,
  getTaskElapsedLabel,
  getTaskEtaLabel,
  getTaskLabel,
  getTaskType,
  isBackgroundTask,
  parseActivityValue,
} from './activities.utils';
import BackgroundTaskRow from './BackgroundTaskRow';
import RealtimeTaskRow from './RealtimeTaskRow';

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

  const { push } = useRouter();
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
      filteredActivities.reduce<string[]>((acc, a) => {
        if (
          isBackgroundTask(a) &&
          getBackgroundTaskStatus(a.key) === 'completed'
        ) {
          acc.push(a.id);
        }
        return acc;
      }, []),
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
    const backgroundTaskItems: UnifiedActivityItem[] =
      filteredActivities.reduce<UnifiedActivityItem[]>((acc, act) => {
        if (isBackgroundTask(act)) {
          acc.push({
            data: act,
            id: act.id,
            timestamp: new Date(act.createdAt),
            type: 'background-task' as const,
          });
        }
        return acc;
      }, []);

    const regularActivityItems: UnifiedActivityItem[] =
      filteredActivities.reduce<UnifiedActivityItem[]>((acc, act) => {
        if (!isBackgroundTask(act)) {
          acc.push({
            data: act,
            id: act.id,
            timestamp: new Date(act.createdAt),
            type: 'activity' as const,
          });
        }
        return acc;
      }, []);

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
    push(href('/studio'));
  };

  const navigateToActivities = () => {
    setIsOpen(false);
    push(href('/overview/activities'));
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
        notificationsService.info('Task is still processing…');
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
        push(href(activityHref));
        return;
      }

      // Status is 'completed' - open the ingredient modal or navigate
      const resultId = parsed?.resultId as string;
      const taskType = getTaskType(activity);

      // For posts, navigate to posts page instead of opening modal
      if (taskType === 'post') {
        setIsOpen(false);
        push(href(getPublisherPostsHref()));
        return;
      }

      // For training, navigate to training/models page
      if (taskType === 'training') {
        setIsOpen(false);
        push(href('/studio/models'));
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

      notificationsService.info('Loading ingredient details…');
    },
    [
      notificationsService,
      openIngredientOverlay,
      navigateToPublisherArticles,
      href,
      push,
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

  const buildBackgroundTaskRowProps = (activity: IActivity) => {
    const parsed = parseActivityValue(activity.value);
    const status = getBackgroundTaskStatus(activity.key);
    const taskType = getTaskType(activity);
    const label =
      (parsed?.label as string) || getTaskLabel(activity, taskType, parsed);
    const progress = parsed?.progress as number | undefined;
    const resultType =
      (parsed?.resultType as IngredientCategory) ||
      getResultTypeFromActivityKey(activity.key) ||
      IngredientCategory.VIDEO;

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

    return { label, preview, progress, status };
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
      const activity = item.data as IActivity;
      const { label, preview, progress, status } =
        buildBackgroundTaskRowProps(activity);
      return (
        <BackgroundTaskRow
          key={item.id}
          activity={activity}
          loadingTaskId={loadingTaskId}
          failedPreviews={failedPreviews}
          status={status}
          label={label}
          progress={progress}
          preview={preview}
          onFailedPreview={(id) =>
            setFailedPreviews((prev) => new Set(prev).add(id))
          }
          onClick={handleBackgroundTaskClick}
        />
      );
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
              <ClientDateTime
                value={activity.createdAt}
                format={(date) => date.toLocaleDateString()}
              />
            </span>
          </Button>
        </div>
      );
    }
  };

  const handleRealtimeTaskClick = useCallback(
    (task: IBackgroundTask) => {
      if (task.status === 'pending' || task.status === 'processing') {
        notificationsService.info('Task is still processing…');
        return;
      }

      if (task.status === 'failed') {
        notificationsService.error(task.error || 'Task failed');
        return;
      }

      setIsOpen(false);
      removeTask(task.id);

      if (task.resultType === 'WORKFLOW') {
        push(href(`/workflows/executions/${task.resultId ?? task.id}`));
        return;
      }

      if (task.resultType) {
        push(href('/studio'));
        return;
      }

      push(href('/overview/activities'));
    },
    [notificationsService, removeTask, href, push],
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const triggerButton = (
    <ActivitiesTriggerButton
      hasActiveGenerations={hasActiveGenerations}
      hasProcessingTasks={hasProcessingTasks}
      activeRealtimeTaskCount={activeRealtimeTasks.length}
      hasAllRealtimeTasksDone={hasAllRealtimeTasksDone}
      totalLegacyCount={
        activeGenerations.length + processingBackgroundTasks.length
      }
    />
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
                className="flex size-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
                ariaLabel="Clear completed tasks"
              >
                <HiXMark className="size-4" />
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
                className="flex size-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
                ariaLabel="Mark all as read"
              >
                <HiCheck className="size-4" />
              </Button>
            )}
            <Button
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              onClick={(e) => {
                e.stopPropagation();
                refresh();
              }}
              className="flex size-7 items-center justify-center text-foreground/60 hover:text-foreground/90 hover:bg-background/60 transition-colors duration-150 p-0 min-h-0"
              ariaLabel="Refresh activities"
            >
              <HiArrowPath className="size-4" />
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
                    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
                  )
                  .map((task) => (
                    <RealtimeTaskRow
                      key={task.id}
                      task={task}
                      etaLabel={getTaskEtaLabel(task)}
                      elapsedLabel={getTaskElapsedLabel(task)}
                      onClick={handleRealtimeTaskClick}
                    />
                  ))}
                <div className="border-t border-white/[0.08] my-1" />
              </>
            )}

            {unifiedItems.length === 0 ? (
              <div className="w-full p-3 text-sm text-foreground/70">
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
