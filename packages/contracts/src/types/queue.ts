/**
 * Queue names, job types, and status constants for BullMQ workflow processing.
 * Shared by core and cloud backends.
 */

export const QUEUE_NAMES = {
  DLQ_IMAGE: 'dlq-image-generation',
  DLQ_LLM: 'dlq-llm-generation',
  DLQ_PROCESSING: 'dlq-processing',
  DLQ_VIDEO: 'dlq-video-generation',
  DLQ_WORKFLOW: 'dlq-workflow-orchestrator',
  IMAGE_GENERATION: 'image-generation',
  LLM_GENERATION: 'llm-generation',
  PROCESSING: 'processing',
  VIDEO_GENERATION: 'video-generation',
  WORKFLOW_ORCHESTRATOR: 'workflow-orchestrator',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_TYPES = {
  EXECUTE_NODE: 'execute-node',
  EXECUTE_WORKFLOW: 'execute-workflow',
  GENERATE_IMAGE: 'generate-image',
  GENERATE_TEXT: 'generate-text',
  GENERATE_VIDEO: 'generate-video',
  REFRAME_IMAGE: 'reframe-image',
  REFRAME_VIDEO: 'reframe-video',
  UPSCALE_IMAGE: 'upscale-image',
  UPSCALE_VIDEO: 'upscale-video',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export const JOB_PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  LOW: 10,
  NORMAL: 5,
} as const;

export const DEFAULT_JOB_OPTIONS = {
  [QUEUE_NAMES.WORKFLOW_ORCHESTRATOR]: {
    attempts: 3,
    backoff: { delay: 2000, type: 'exponential' as const },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 5000 },
  },
  [QUEUE_NAMES.IMAGE_GENERATION]: {
    attempts: 3,
    backoff: { delay: 10000, type: 'exponential' as const },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 5000 },
  },
  [QUEUE_NAMES.VIDEO_GENERATION]: {
    attempts: 3,
    backoff: { delay: 10000, type: 'exponential' as const },
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: { age: 86400, count: 2000 },
  },
  [QUEUE_NAMES.LLM_GENERATION]: {
    attempts: 3,
    backoff: { delay: 500, type: 'fixed' as const },
    removeOnComplete: { age: 3600, count: 2000 },
    removeOnFail: { age: 86400, count: 5000 },
  },
  [QUEUE_NAMES.PROCESSING]: {
    attempts: 3,
    backoff: { delay: 2000, type: 'exponential' as const },
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: { age: 86400, count: 2000 },
  },
} as const;

export const QUEUE_CONCURRENCY = {
  [QUEUE_NAMES.WORKFLOW_ORCHESTRATOR]: 10,
  [QUEUE_NAMES.IMAGE_GENERATION]: 10,
  [QUEUE_NAMES.VIDEO_GENERATION]: 10,
  [QUEUE_NAMES.LLM_GENERATION]: 10,
  [QUEUE_NAMES.PROCESSING]: 10,
} as const;

export const JOB_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DELAYED: 'delayed',
  FAILED: 'failed',
  PENDING: 'pending',
  RECOVERED: 'recovered',
  STALLED: 'stalled',
  WAITING: 'waiting',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export const EXECUTION_STATUS = {
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PENDING: 'pending',
  RUNNING: 'running',
} as const;

export type ExecutionStatus =
  (typeof EXECUTION_STATUS)[keyof typeof EXECUTION_STATUS];

export const PREDICTION_STATUS = {
  CANCELED: 'canceled',
  FAILED: 'failed',
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
} as const;

export type PredictionStatus =
  (typeof PREDICTION_STATUS)[keyof typeof PREDICTION_STATUS];

export const NODE_RESULT_STATUS = {
  COMPLETE: 'complete',
  ERROR: 'error',
  PENDING: 'pending',
  PROCESSING: 'processing',
} as const;

export type NodeResultStatus =
  (typeof NODE_RESULT_STATUS)[keyof typeof NODE_RESULT_STATUS];

export const MAX_RECOVERY_ATTEMPTS = 3;
