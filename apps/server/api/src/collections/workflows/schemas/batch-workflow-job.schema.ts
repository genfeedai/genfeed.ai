import type { BatchWorkflowJob as PrismaBatchWorkflowJob } from '@genfeedai/prisma';

export interface BatchWorkflowItemOutputSummary {
  category?: string;
  id?: string;
  ingredientUrl?: string;
  label?: string;
  description?: string;
  status?: string;
  thumbnailUrl?: string;
  [key: string]: unknown;
}

export interface BatchWorkflowItemDocument {
  id?: string;
  ingredientId: string;
  status: BatchWorkflowItemStatus | string;
  executionId?: string;
  outputIngredientId?: string;
  outputCategory?: string;
  outputSummary?: BatchWorkflowItemOutputSummary;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  [key: string]: unknown;
}

export interface BatchWorkflowJobDocument
  extends Omit<PrismaBatchWorkflowJob, 'items'> {
  items: BatchWorkflowItemDocument[];
  completedCount?: number;
  failedCount?: number;
  totalCount?: number;
  [key: string]: unknown;
}

/** Matches Prisma BatchStatus labels used on batch_workflow_jobs.status. */
export enum BatchWorkflowJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum BatchWorkflowItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
