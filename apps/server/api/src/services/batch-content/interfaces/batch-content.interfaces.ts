import type { ContentDraft } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';

export interface BatchContentRequest {
  organizationId: string;
  brandId: string;
  skillSlug: string;
  count: number;
  params?: Record<string, unknown>;
}

export interface BatchContentResult {
  results: ContentDraft[];
  summary: {
    total: number;
    completed: number;
    failed: number;
  };
  duration: number;
}

export type BatchLifecycleStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface BatchStatus {
  batchId: string;
  organizationId: string;
  brandId: string;
  total: number;
  completed: number;
  failed: number;
  results: ContentDraft[];
  status: BatchLifecycleStatus;
}

export interface BatchContentItemJobData {
  batchId: string;
  itemIndex: number;
  request: BatchContentRequest;
  userId?: string;
}
