import type { Task } from '@genfeedai/prisma';

export type { Task } from '@genfeedai/prisma';

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

export type TaskEvent = {
  createdAt?: Date | string;
  id: string;
  payload?: Record<string, unknown>;
  timestamp: Date;
  type: string;
  userId?: string;
};

export type TaskProgress = {
  activeRunCount: number;
  message?: string;
  percent: number;
  stage?: string;
};

export interface TaskDocument
  extends Omit<
    Task,
    | 'decomposition'
    | 'eventStream'
    | 'planningThreadId'
    | 'priority'
    | 'progress'
    | 'status'
  > {
  _id: string;
  approvedOutputIds: string[];
  assigneeUserId?: string;
  brand?: string;
  chosenModel?: string;
  chosenProvider?: string;
  completedAt?: Date;
  decomposition?: Record<string, unknown> | null;
  dismissedAt?: Date;
  dismissedReason?: string;
  eventStream: TaskEvent[];
  executionPathUsed?: string;
  failureReason?: string;
  identifier?: string;
  linkedApprovalIds: string[];
  linkedOutputIds: string[];
  linkedRunIds: string[];
  organization: string;
  outputType: TaskOutputType;
  platforms: string[];
  planningThreadId?: string;
  priority: TaskPriority;
  progress?: TaskProgress;
  qualityAssessment?: Record<string, unknown>;
  request: string;
  requestedChangesReason?: string;
  resultPreview?: string;
  reviewState: string;
  reviewTriggered: boolean;
  routingSummary?: string;
  skillVariantIds: string[];
  skillsUsed: string[];
  status: TaskStatus;
  taskNumber?: number;
  title: string;
  user?: string;
  [key: string]: unknown;
}
