/** Workspace task lifecycle (`Task.status`). */
export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'failed',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Review gate on a task's outputs (`Task.reviewState`). */
export const TASK_REVIEW_STATES = [
  'none',
  'pending_approval',
  'approved',
  'changes_requested',
  'dismissed',
] as const;

export type TaskReviewState = (typeof TASK_REVIEW_STATES)[number];
