import type { FileJobPriority } from '@genfeedai/contracts/queue';

/** Queue retry, retention, and priority defaults for a file-processing job. */
export interface JobConfig {
  attempts: number;
  delay: number;
  defaultPriority: FileJobPriority;
  removeOnComplete?: number | { age: number; count: number };
  removeOnFail?: number | { age: number; count: number };
}
