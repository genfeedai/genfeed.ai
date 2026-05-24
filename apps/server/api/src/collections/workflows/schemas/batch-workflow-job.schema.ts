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
  _id?: string;
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
  _id: string;
  workflow?: string | Record<string, unknown>;
  user?: string | Record<string, unknown>;
  organization?: string | Record<string, unknown>;
  items: BatchWorkflowItemDocument[];
  completedCount?: number;
  failedCount?: number;
  totalCount?: number;
  [key: string]: unknown;
}

export enum BatchWorkflowJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum BatchWorkflowItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
