export interface HookRemixJobData {
  jobId: string;
  youtubeUrl: string;
  ctaVideoUrl: string;
  hookDurationSeconds: number;
  organizationId: string;
  userId: string;
  brandId: string;
  label?: string;
  description?: string;
  callbackUrl?: string;
}

export interface HookRemixResult {
  success: boolean;
  s3Url?: string;
  s3Key?: string;
  duration?: number;
  width?: number;
  height?: number;
  size?: number;
  error?: string;
}

export interface HookRemixBatchStatus {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  jobs: Array<{
    jobId: string;
    youtubeUrl: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: HookRemixResult;
    error?: string;
  }>;
}
