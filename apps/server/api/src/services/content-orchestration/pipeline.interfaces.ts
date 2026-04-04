import {
  ImageTaskModel,
  MusicTaskModel,
  VideoTaskModel,
} from '@genfeedai/enums';

// ── Step discriminated unions ────────────────────────────────────────

export interface TextToImageStep {
  type: 'text-to-image';
  model: ImageTaskModel;
  prompt?: string;
  aspectRatio?: string;
}

export interface ImageToVideoStep {
  type: 'image-to-video';
  model: VideoTaskModel;
  prompt?: string;
  duration?: number;
  aspectRatio?: string;
  /** Required if this is the first step (no preceding T2I) */
  imageUrl?: string;
}

export interface TextToSpeechStep {
  type: 'text-to-speech';
  model: MusicTaskModel;
  voiceId: string;
  text?: string;
}

export interface TextToMusicStep {
  type: 'text-to-music';
  model: MusicTaskModel;
  prompt?: string;
  duration?: number;
}

export type PipelineStep =
  | TextToImageStep
  | ImageToVideoStep
  | TextToSpeechStep
  | TextToMusicStep;

// ── Pipeline config ──────────────────────────────────────────────────

export type PublishMode = 'all' | 'final' | 'none';

export type PipelineRunStatus =
  | 'pending'
  | 'running'
  | 'partial'
  | 'completed'
  | 'failed';

export interface PipelineConfigV2 {
  personaId: string;
  organizationId: string;
  userId: string;
  brandId: string;
  steps: PipelineStep[];
  publishMode?: PublishMode; // default: 'final'
  idempotencyKey?: string;
  platforms?: string[];
  scheduledDate?: Date;
  prompt?: string; // global prompt (used as fallback for steps without one)
}

// ── Step result ──────────────────────────────────────────────────────

export interface StepResult {
  url: string;
  contentType: string; // e.g. 'image/png', 'video/mp4', 'audio/mpeg'
}

// ── Pipeline result ─────────────────────────────────────────────────

export interface StepOutcome {
  stepIndex: number;
  step: PipelineStep;
  result?: StepResult;
  ingredientId?: string;
  error?: PipelineError;
}

export interface PipelineResultV2 {
  status: PipelineRunStatus;
  steps: StepOutcome[];
  postIds?: string[];
  timings?: {
    totalMs: number;
    stepTimingsMs: number[];
  };
}

// ── Structured errors ────────────────────────────────────────────────

export interface PipelineError {
  code: string;
  message: string;
  retryable: boolean;
  stage: string;
  provider?: string;
}
