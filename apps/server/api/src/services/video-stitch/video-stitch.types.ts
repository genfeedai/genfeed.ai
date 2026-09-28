import type {
  IVideoMergeSettings,
  VideoStitchCallerKind,
} from '@genfeedai/contracts/interfaces';

/**
 * `after_merge` fits the joined video to the dimensions; `per_clip` scales
 * every clip first, for clips of mixed sizes (storyboard runs).
 */
export type VideoStitchResizeMode = 'after_merge' | 'per_clip';

/**
 * `join` stitches two or more clips. `finalize` turns a finished sequence
 * (an interpolation batch, a storyboard run) into its deliverable, which may
 * be a single clip.
 */
export type VideoStitchMode = 'join' | 'finalize';

export interface VideoStitchOutput {
  height: number;
  resize: VideoStitchResizeMode;
  width: number;
}

export interface VideoStitchRequest {
  brandId: string;
  callerKind: VideoStitchCallerKind;
  /** Ordered clip ingredient ids; a repeated id keeps each position. */
  clipIds: string[];
  /** A repeated key returns the existing output instead of a second job. */
  idempotencyKey: string;
  /** Defaults to `join`. */
  mode?: VideoStitchMode;
  organizationId: string;
  output?: VideoStitchOutput;
  /** Lineage the caller owns, such as the video a workflow extends. */
  parentId?: string;
  providerData?: Record<string, unknown>;
  /** User whose socket room receives events; defaults to `userId`. */
  roomUserId?: string;
  settings: IVideoMergeSettings;
  /** Requesting user, or the owning user a system caller acts for. */
  userId: string;
  /** Workflow execution that produced the output, for output discovery. */
  workflowExecutionId?: string;
}

export type VideoStitchState = 'processing' | 'generated' | 'failed';

/** Enough to find a stitch again, e.g. from a caller's persisted state. */
export interface VideoStitchRef {
  jobId: string;
  organizationId: string;
  outputId: string;
  roomUserId?: string;
}

export interface VideoStitchHandle extends VideoStitchRef {
  isExisting: boolean;
  state: VideoStitchState;
}

export interface VideoStitchOutcome {
  error?: string;
  jobId: string;
  outputId: string;
  s3Key?: string;
  state: VideoStitchState;
}

/** A validated request resolved to the clips' stored objects. */
export interface VideoStitchPlan {
  clipIds: string[];
  output?: VideoStitchOutput;
  settings: IVideoMergeSettings;
  sourceStorageKeys: string[];
}

export interface VideoStitchJobParams {
  height?: number;
  isMuteVideoAudio?: boolean;
  isPersistedOutputOnly: true;
  isResizeEnabled?: boolean;
  music?: string;
  /** Worker gain, 0–1. */
  musicVolume?: number;
  normalizeClips?: boolean;
  sourceIds: string[];
  sourceStorageKeys: string[];
  transition: string;
  transitionDuration?: number;
  transitionEaseCurve?: string;
  width?: number;
  [key: string]: unknown;
}

/** The object delivered as the output: the merge, or its captioned copy. */
export interface VideoStitchFinalFile {
  s3Key: string;
  /** Bytes of that object; unknown when the job did not report it. */
  size?: number;
}

/** Output columns the stitch service reads back. */
export interface VideoStitchOutputRow {
  _count: { sources: number };
  brandId: string | null;
  generationError: string | null;
  generationSource: string | null;
  id: string;
  mergeSettings: unknown;
  metadataId: string | null;
  s3Key: string | null;
  status: string;
  userId: string | null;
}

/** Everything completion needs, recoverable from the output row alone. */
export interface VideoStitchContext {
  brandId: string | null;
  callerKind?: VideoStitchCallerKind;
  clipCount: number;
  jobId: string;
  organizationId: string;
  outputId: string;
  roomUserId: string;
  settings: IVideoMergeSettings;
  userId: string;
}
