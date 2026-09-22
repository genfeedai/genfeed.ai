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

/**
 * Where a task's `outputType` came from: the caller stated it, the keyword
 * table inferred it, or the typed decision point decided it (#4867).
 */
export const TASK_OUTPUT_TYPE_SOURCES = [
  'decision',
  'explicit',
  'keyword',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskLinkedEntityModel = (typeof TASK_LINKED_ENTITY_MODELS)[number];
export type TaskOutputType = (typeof TASK_OUTPUT_TYPES)[number];
export type TaskOutputTypeSource = (typeof TASK_OUTPUT_TYPE_SOURCES)[number];

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
    | 'assigneeUserId'
    | 'completedAt'
    | 'dismissedAt'
    | 'failureReason'
    | 'requestedChangesReason'
  > {
  approvedOutputIds: string[];
  assigneeUserId?: string;
  chosenModel?: string;
  chosenProvider?: string;
  completedAt?: Date;
  decomposition?: Record<string, unknown> | null;
  dismissedAt?: Date;
  dismissedReason?: string;
  elevenlabsVoiceId?: string;
  eventStream: TaskEvent[];
  executionPathUsed?: string;
  failureReason?: string;
  identifier: string | null;
  heygenAvatarId?: string;
  linkedApprovalIds: string[];
  linkedEntities: Array<{
    entityId: string;
    entityModel: TaskLinkedEntityModel;
  }>;
  linkedExecutionIds: string[];
  linkedIssueId?: string;
  linkedOutputIds: string[];
  outputType: TaskOutputType;
  /** Confidence of a decided outputType. Absent unless the source is `decision`. */
  outputTypeConfidence?: number;
  outputTypeSource?: TaskOutputTypeSource;
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
  taskNumber: number | null;
  title: string;
  voiceId?: string;
  voiceProvider?: string;
  [key: string]: unknown;
}
