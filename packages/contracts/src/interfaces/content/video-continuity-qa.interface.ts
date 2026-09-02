export const VIDEO_CONTINUITY_QA_SCHEMA_VERSION = 1 as const;

export type VideoContinuityVerdict =
  | 'consistent'
  | 'drift'
  | 'uncertain'
  | 'not_assessed';

export type VideoContinuityQaStatus = 'completed' | 'partial' | 'skipped';

export type VideoContinuityQaSkipReason =
  | 'canonical_references_unavailable'
  | 'continuity_resolver_unavailable'
  | 'vision_model_unavailable';

export interface VideoContinuityDimensionFinding {
  confidence: number | null;
  summary: string;
  verdict: VideoContinuityVerdict;
}

export interface VideoContinuityEvidenceFrame {
  kind: 'contact_sheet' | 'frame';
  url: string;
}

export interface VideoContinuityQaError {
  code: 'FRAME_EXTRACTION_FAILED' | 'MODEL_FAILED' | 'MODEL_RESPONSE_INVALID';
  message: string;
}

export interface VideoContinuityClipFinding {
  character: VideoContinuityDimensionFinding;
  clipId: string;
  clipIndex: number;
  errors: VideoContinuityQaError[];
  evidenceFrames: VideoContinuityEvidenceFrame[];
  outfit: VideoContinuityDimensionFinding;
  product: VideoContinuityDimensionFinding;
  videoUrl?: string;
}

export interface VideoContinuityQaReport {
  clips: VideoContinuityClipFinding[];
  completedAt: string;
  modelKey?: string;
  projectId: string;
  referenceAssetIds: {
    character: string[];
    product: string[];
  };
  runId: string;
  schemaVersion: typeof VIDEO_CONTINUITY_QA_SCHEMA_VERSION;
  skipReason?: VideoContinuityQaSkipReason;
  status: VideoContinuityQaStatus;
  summary: {
    assessedClipCount: number;
    driftClipCount: number;
    errorClipCount: number;
    totalClipCount: number;
  };
}

export function createNotAssessedContinuityDimension(
  summary: string,
): VideoContinuityDimensionFinding {
  return { confidence: null, summary, verdict: 'not_assessed' };
}
