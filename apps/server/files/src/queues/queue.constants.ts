import {
  FILE_JOB_PRIORITY,
  FILE_JOB_TYPES,
  FILE_QUEUE_NAMES,
} from '@genfeedai/queue-contracts';

export {
  FILE_JOB_PRIORITY as JOB_PRIORITY,
  FILE_JOB_TYPES as JOB_TYPES,
  FILE_QUEUE_NAMES as QUEUE_NAMES,
};

export type QueueName =
  (typeof FILE_QUEUE_NAMES)[keyof typeof FILE_QUEUE_NAMES];
export type JobType = (typeof FILE_JOB_TYPES)[keyof typeof FILE_JOB_TYPES];
export type JobPriority =
  (typeof FILE_JOB_PRIORITY)[keyof typeof FILE_JOB_PRIORITY];

/**
 * Configuration for a job type
 */
export interface JobConfig {
  attempts: number;
  delay: number;
  defaultPriority: JobPriority;
  removeOnComplete?: number | { age: number; count: number };
  removeOnFail?: number | { age: number; count: number };
}
