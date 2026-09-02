import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import { RAW_CUT_JOB_PREFIX } from '@genfeedai/contracts/interfaces';
import type { Job } from 'bullmq';

const YOUTUBE_HOSTS = new Set([
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube.com',
  'youtu.be',
  'youtube.com',
]);

export interface VideoCompletionResult {
  duration?: number;
  endTime?: number;
  ingredientId?: string;
  jobId?: string;
  jobType?: string;
  outputPath?: string;
  s3Key?: string;
  startTime?: number;
  url?: string;
}

export function isYoutubeUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      YOUTUBE_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isFinalAttempt(job: Job<VideoJobData>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

export function isRawCutJob(job: Job<VideoJobData>): boolean {
  return String(job.id).startsWith(RAW_CUT_JOB_PREFIX);
}
