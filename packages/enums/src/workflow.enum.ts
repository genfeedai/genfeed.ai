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

export enum WorkflowStepCategory {
  TRANSFORM = 'transform',
  UPSCALE = 'upscale',
  RESIZE = 'resize',
  CAPTION = 'caption',
  CLIP = 'clip',
  PUBLISH = 'publish',
  WEBHOOK = 'webhook',
  DELAY = 'delay',
  GENERATE_IMAGE = 'generate-image',
  GENERATE_VIDEO = 'generate-video',
  GENERATE_MUSIC = 'generate-music',
  GENERATE_ARTICLE = 'generate-article',
  COLOR_GRADE = 'color-grade',
  GENERATE_HOOK = 'generate-hook',
  TEXT_OVERLAY = 'text-overlay',
  IMAGE_BATCH = 'image-batch',
  PERFORMANCE_TRACK = 'performance-track',
}

export enum WorkflowStepStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
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

export enum WorkflowExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum WorkflowExecutionTrigger {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  EVENT = 'event',
  API = 'api',
}
