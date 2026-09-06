import type {
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';

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

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  done: 'Done',
  failed: 'Failed',
  in_progress: 'In Progress',
  in_review: 'In Review',
  todo: 'To Do',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  low: 'Low',
  medium: 'Medium',
};
