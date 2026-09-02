'use client';

import { useBackgroundTaskContext } from '@genfeedai/contexts/ui/background-task-context';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
} from '@genfeedai/contracts/constants';
import type { IBackgroundTaskUpdateEvent } from '@genfeedai/contracts/interfaces';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { getPublishingPostsHref } from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
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
      ? `${APP_ROUTES.AUTOMATION.RUNS}/${targetId}`
      : APP_ROUTES.AUTOMATION.RUNS;
  }

  if (resultType === 'article' || label.includes('article')) {
    // A finished article is an artifact — send it to its own editor page.
    return event.resultId
      ? createArtifactEditorRoute('article', event.resultId)
      : APP_ROUTES.PUBLISHING.ROOT;
  }

  if (
    resultType === 'post' ||
    label.includes('post') ||
    label.includes('publish')
  ) {
    return getPublishingPostsHref();
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
    return APP_ROUTES.STUDIO.ROOT;
  }

  return APP_ROUTES.OVERVIEW.ACTIVITIES;
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
