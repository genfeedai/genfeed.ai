'use client';

import { COMPOSE_ROUTES } from '@genfeedai/constants';
import { useIngredientOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection.context';
import { useBackgroundTaskContext } from '@genfeedai/contexts/ui/background-task-context';
import { ActivityKey, IngredientCategory } from '@genfeedai/enums';
import { getPublisherPostsHref } from '@genfeedai/helpers/content/posts.helper';
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
import type { UnifiedActivityItem } from '@genfeedai/interfaces/components/topbar-activities.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBackgroundTaskStatus,
  getResultTypeFromActivityKey,
  getTaskLabel,
  getTaskType,
  isBackgroundTask,
  parseActivityValue,
} from './activities.utils';

export function useTopbarActivities() {
  const { activeGenerations } = useAssetSelection();
  const { removeTask, tasks: realtimeTasks } = useBackgroundTaskContext();
  const {
    filteredActivities,
    refresh,
    markActivitiesAsRead,
    clearCompletedActivities,
  } = useActivities({
    autoLoad: true,
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

  const unreadCount = useMemo(() => {
    return filteredActivities.filter((a) => !a.isRead).length;
  }, [filteredActivities]);

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

  const unifiedItems = useMemo(() => {
    const generationItems: UnifiedActivityItem[] = activeGenerations.map(
      (gen) => ({
        data: gen,
        id: gen.id,
        timestamp: new Date(gen.startTime),
        type: 'generation' as const,
      }),
    );

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

    return [
      ...generationItems,
      ...backgroundTaskItems,
      ...regularActivityItems,
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [activeGenerations, filteredActivities]);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(async () => {
      if (isRefreshingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      isRefreshingRef.current = true;
      try {
        await refresh();
      } finally {
        isRefreshingRef.current = false;
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          debouncedRefresh();
        }
      }
    }, 500);
  }, [refresh]);

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
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [isReady, subscribe, debouncedRefresh]);

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

  const getPreviewUrl = useCallback(
    (
      ingredient: IIngredient | undefined,
      category: IngredientCategory,
    ): string | undefined => {
      if (!ingredient) {
        return undefined;
      }

      if (category === IngredientCategory.VIDEO) {
        if (ingredient.thumbnailUrl) {
          return ingredient.thumbnailUrl;
        }
      } else if (category === IngredientCategory.IMAGE) {
        if (ingredient.ingredientUrl) {
          return ingredient.ingredientUrl;
        } else if (ingredient.thumbnailUrl) {
          return ingredient.thumbnailUrl;
        }
      }

      return undefined;
    },
    [],
  );

  useEffect(() => {
    if (isOpen) {
      refresh();
    }
  }, [isOpen, refresh]);

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
    await markActivitiesAsRead();
  };

  const handleClearCompleted = async () => {
    await clearCompletedActivities(completedBackgroundTaskIds);
  };

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

      const resultId = parsed?.resultId as string;
      const taskType = getTaskType(activity);

      if (taskType === 'post') {
        setIsOpen(false);
        push(href(getPublisherPostsHref()));
        return;
      }

      if (taskType === 'training') {
        setIsOpen(false);
        push(href('/studio/models'));
        return;
      }

      if (
        activity.key === ActivityKey.ARTICLE_GENERATED ||
        activity.key === ActivityKey.ARTICLE_PROCESSING ||
        activity.key === ActivityKey.ARTICLE_FAILED
      ) {
        navigateToPublisherArticles(resultId);
        return;
      }

      const populatedActivity = activity as IActivityPopulated;
      if (populatedActivity.ingredient?.id) {
        setIsOpen(false);
        setTimeout(() => {
          openIngredientOverlay(populatedActivity.ingredient as IIngredient);
        }, 100);
        return;
      }

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

  return {
    activeGenerations,
    activeRealtimeTasks,
    buildBackgroundTaskRowProps,
    completedBackgroundTaskIds,
    failedPreviews,
    hasActiveGenerations,
    hasAllRealtimeTasksDone,
    hasProcessingTasks,
    href,
    isHydrated,
    isOpen,
    loadingTaskId,
    navigateToStudio,
    processingBackgroundTasks,
    realtimeTasks,
    refresh,
    handleBackgroundTaskClick,
    handleClearCompleted,
    handleItemClick,
    handleMarkAllRead,
    handleRealtimeTaskClick,
    setFailedPreviews,
    setIsOpen,
    unifiedItems,
    unreadCount,
  };
}
