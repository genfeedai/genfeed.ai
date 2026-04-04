/**
 * Clip Analyze queue constants.
 *
 * Lightweight queue that only runs transcription + highlight detection
 * (no avatar generation). Users review highlights before spending credits.
 */
export const CLIP_ANALYZE_QUEUE = 'clip-analyze';

export const CLIP_ANALYZE_JOB_NAME = 'clip-analyze-run';

export const CLIP_ANALYZE_CONCURRENCY = 3;

export interface ClipAnalyzeJobData {
  projectId: string;
  youtubeUrl: string;
  maxClips: number;
  minViralityScore: number;
  language: string;
  orgId: string;
  userId: string;
}
