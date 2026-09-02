import type { GeneratedContent } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';

export interface BatchContentRequest {
  organizationId: string;
  brandId: string;
  skillSlug: string;
  count: number;
  params?: Record<string, unknown>;
}

export interface QueuedBatchContentResult {
  jobId: string;
  status: 'queued';
}

export interface BatchContentResult {
  results: GeneratedContent[];
  summary: {
    total: number;
    completed: number;
    failed: number;
  };
  duration: number;
}
