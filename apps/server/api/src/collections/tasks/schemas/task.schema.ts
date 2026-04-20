export type {
  Task,
  Task as TaskDocument,
} from '@genfeedai/prisma';

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

export const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export const TASK_LINKED_ENTITY_MODELS = [
  'Ingredient',
  'Post',
  'Article',
  'Evaluation',
] as const;

export const TASK_OUTPUT_TYPES = [
  'caption',
  'facecam',
  'image',
  'ingredient',
  'newsletter',
  'post',
  'video',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskLinkedEntityModel = (typeof TASK_LINKED_ENTITY_MODELS)[number];
export type TaskOutputType = (typeof TASK_OUTPUT_TYPES)[number];
