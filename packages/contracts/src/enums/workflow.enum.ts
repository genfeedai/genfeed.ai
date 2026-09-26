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

export enum WorkflowExecutionTrigger {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  EVENT = 'event',
  API = 'api',
}

/**
 * Auth mode for a workflow's public inbound webhook trigger
 * (`POST /v1/webhooks/:webhookId`). Persisted as a plain string inside the
 * workflow's JSON `config` blob (not a Prisma enum column), so the trigger
 * endpoint must still validate a stored value against this enum at read
 * time and reject anything else — see genfeedai/genfeed.ai#5248.
 */
export enum WorkflowWebhookAuthType {
  NONE = 'none',
  SECRET = 'secret',
  BEARER = 'bearer',
}
