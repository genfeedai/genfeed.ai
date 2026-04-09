'use client';

import { useBackgroundTaskContext } from '@genfeedai/contexts/ui/background-task-context';
import type { IBackgroundTaskUpdateEvent } from '@genfeedai/interfaces';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { COMPOSE_ROUTES } from '@ui-constants/compose.constant';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const START_TOAST_DURATION_MS = 5_000;

function buildBackgroundTaskHref(event: IBackgroundTaskUpdateEvent): string {
  const label = event.label?.toLowerCase() ?? '';
  const resultType = event.resultType?.toLowerCase() ?? '';
  const targetId = event.resultId ?? event.taskId;

  if (
    resultType === 'workflow' ||
    label.includes('workflow') ||
    label.includes('batch content')
  ) {
    return targetId
      ? `/workflows/executions/${targetId}`
      : '/workflows/executions';
  }

  if (resultType === 'article' || label.includes('article')) {
    return event.resultId
      ? `${COMPOSE_ROUTES.ARTICLE}?id=${event.resultId}`
      : COMPOSE_ROUTES.ARTICLE;
  }

  if (
    resultType === 'post' ||
    label.includes('post') ||
    label.includes('publish')
  ) {
    return getPublisherPostsHref();
  }

  if (
    resultType === 'training' ||
    resultType === 'model' ||
    label.includes('training')
  ) {
    return '/studio/models';
  }

  if (
    resultType === 'image' ||
    resultType === 'video' ||
    resultType === 'music' ||
    label.includes('image') ||
    label.includes('video') ||
    label.includes('music') ||
    label.includes('generation') ||
    label.includes('merge')
  ) {
    return '/studio';
  }

  return '/overview/activities';
}

function buildBackgroundTaskStartedMessage(
  event: IBackgroundTaskUpdateEvent,
): string {
  const label = event.label?.trim() || 'Background task';

  if (/started$/i.test(label) || /queued$/i.test(label)) {
    return label;
  }

  return `${label} started`;
}

export function useBackgroundTasks() {
  const { upsertTaskFromEvent } = useBackgroundTaskContext();
  const { isReady, subscribe } = useSocketManager();
  const router = useRouter();
  const { href } = useOrgUrl();
  const notifiedTaskIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const unsubscribe = subscribe<IBackgroundTaskUpdateEvent>(
      'background-task-update',
      (event) => {
        if (!event?.taskId) {
          return;
        }

        if (
          event.status === 'processing' &&
          !notifiedTaskIdsRef.current.has(event.taskId)
        ) {
          notifiedTaskIdsRef.current.add(event.taskId);

          NotificationsService.getInstance().info(
            buildBackgroundTaskStartedMessage(event),
            {
              actionLabel: 'View',
              description: 'Track progress from the linked task view.',
              duration: START_TOAST_DURATION_MS,
              onAction: () => {
                router.push(href(buildBackgroundTaskHref(event)));
              },
            },
          );
        }

        upsertTaskFromEvent(event);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [isReady, router, href, subscribe, upsertTaskFromEvent]);
}
