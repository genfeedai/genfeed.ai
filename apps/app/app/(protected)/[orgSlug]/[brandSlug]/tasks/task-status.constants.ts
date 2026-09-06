'use client';

import type {
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/** One vocabulary for task status everywhere: list, board, inbox, inspector. */
export const STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'failed',
  'done',
  'cancelled',
];

export const PRIORITY_ORDER: TaskPriority[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export function useTaskStatusLabels(): Record<TaskStatus, string> {
  const translate = useTranslations('pages.tasks.status');
  return useMemo(
    () => ({
      backlog: translate('backlog'),
      blocked: translate('blocked'),
      cancelled: translate('cancelled'),
      done: translate('done'),
      failed: translate('failed'),
      in_progress: translate('inProgress'),
      in_review: translate('inReview'),
      todo: translate('todo'),
    }),
    [translate],
  );
}

export function useTaskPriorityLabels(): Record<TaskPriority, string> {
  const translate = useTranslations('pages.tasks.priority');
  return useMemo(
    () => ({
      critical: translate('critical'),
      high: translate('high'),
      low: translate('low'),
      medium: translate('medium'),
    }),
    [translate],
  );
}
