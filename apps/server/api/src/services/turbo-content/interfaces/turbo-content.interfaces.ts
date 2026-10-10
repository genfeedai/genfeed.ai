import type { GeneratedContent } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';

export interface TurboContentRequest {
  organizationId: string;
  brandId: string;
  skillSlug: string;
  count: number;
  params?: Record<string, unknown>;
}

export interface QueuedTurboContentResult {
  jobId: string;
  status: 'queued';
}

export interface TurboContentResult {
  results: GeneratedContent[];
  summary: {
    total: number;
    completed: number;
    failed: number;
  };
  duration: number;
}
