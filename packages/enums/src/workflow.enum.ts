export enum WorkflowTrigger {
  MANUAL = 'manual',
  ON_VIDEO_COMPLETE = 'on-video-complete',
  ON_IMAGE_COMPLETE = 'on-image-complete',
  SCHEDULED = 'scheduled',
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RUNNING = 'running',
}

export enum WorkflowRecurrenceType {
  ONCE = 'once',
  EVERY_30_MIN = 'every-30-min',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum WorkflowLifecycle {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/**
 * Workflow execution lifecycle. Values match Prisma
 * `WorkflowExecutionStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum WorkflowExecutionStatus`
 */
export enum WorkflowExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Per-item status inside a batch workflow job's `items` payload.
 *
 * Deliberately lowercase: `batch_workflow_jobs.items` is a `Json` column, not a
 * Prisma enum, so these labels are the literal stored vocabulary. The job's own
 * `status` column IS a Prisma enum — use `BatchStatus` (SCREAMING) for it.
 * @see packages/prisma/prisma/schema.prisma `model BatchWorkflowJob`
 */
export enum WorkflowBatchItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum WorkflowExecutionTrigger {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  EVENT = 'event',
  API = 'api',
}
