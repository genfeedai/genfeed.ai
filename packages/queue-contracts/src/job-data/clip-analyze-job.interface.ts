/**
 * Clip Analyze queue contract.
 *
 * Lightweight queue that only runs transcription + highlight detection
 * (no avatar generation). Users review highlights before spending credits.
 */
import type {
  ClipSourceArtifact,
  ClipSourceContract,
} from '@genfeedai/interfaces';

export const CLIP_ANALYZE_JOB_NAME = 'clip-analyze-run';

export const CLIP_ANALYZE_CONCURRENCY = 3;

export interface ClipAnalyzeJobData {
  highlightFallback?: 'deterministic';
  highlightModel?: string;
  projectId: string;
  youtubeUrl: string;
  maxClips: number;
  minViralityScore: number;
  language: string;
  orgId: string;
  userId: string;
  /** Authenticated Studio source lifecycle. Public acquisition jobs may omit it. */
  source?: ClipSourceContract;
}

export interface ClipAnalyzeJobResult {
  sourceArtifact?: ClipSourceArtifact;
}
