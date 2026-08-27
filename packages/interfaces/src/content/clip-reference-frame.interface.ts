export const CLIP_REFERENCE_FRAME_SCHEMA_VERSION = 1 as const;

export const CLIP_REFERENCE_FRAME_STATUSES = [
  'pending',
  'ready',
  'partial',
  'unavailable',
  'selected',
] as const;

export type ClipReferenceFrameStatus =
  (typeof CLIP_REFERENCE_FRAME_STATUSES)[number];

export const CLIP_REFERENCE_FRAME_CANDIDATE_STATUSES = [
  'pending',
  'available',
  'failed',
] as const;

export type ClipReferenceFrameCandidateStatus =
  (typeof CLIP_REFERENCE_FRAME_CANDIDATE_STATUSES)[number];

export const CLIP_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES = [
  'info',
  'warning',
  'error',
] as const;

export type ClipReferenceFrameDiagnosticSeverity =
  (typeof CLIP_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES)[number];

export interface ClipReferenceFrameDiagnostic {
  code: string;
  message: string;
  severity: ClipReferenceFrameDiagnosticSeverity;
  candidateId?: string;
}

export interface ClipReferenceFrameCandidate {
  id: string;
  timestampSeconds: number;
  status: ClipReferenceFrameCandidateStatus;
  assetId?: string;
  storageKey?: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  diagnostics: ClipReferenceFrameDiagnostic[];
}

export interface ClipReferenceFrameSet {
  schemaVersion: typeof CLIP_REFERENCE_FRAME_SCHEMA_VERSION;
  status: ClipReferenceFrameStatus;
  candidates: ClipReferenceFrameCandidate[];
  selectedCandidateId: string | null;
  diagnostics: ClipReferenceFrameDiagnostic[];
}

export interface ClipReferenceFrameExtractionInput {
  organizationId: string;
  projectId: string;
  sourceUrl: string;
  timestamps: number[];
}

/**
 * Client-facing shape of a clip project read, as consumed by the studio clips
 * surface. Shared so the API client and the page hook cannot drift.
 */
export interface ClipProjectReadResponse {
  brandId?: string;
  createdAt?: string;
  error?: string | null;
  failedClipCount?: number;
  name?: string;
  pendingClipCount?: number;
  progress?: number;
  readyClipCount?: number;
  referenceFrames?: ClipReferenceFrameSet;
  source?: import('./clip-source.interface').ClipSourceContract;
  settings?: {
    maxClips?: number;
    mode?: string;
  };
  sourceVideoUrl?: string;
  sourceVideoS3Key?: string;
  status?: string;
}

export const HOOK_CLIP_APPROVAL_ACTIONS = [
  'approve',
  'request_changes',
  'reject',
] as const;

export type HookClipApprovalAction =
  (typeof HOOK_CLIP_APPROVAL_ACTIONS)[number];

export const HOOK_CLIP_APPROVAL_STATES = [
  'not_required',
  'generating_hook',
  'awaiting_confirmation',
  'resuming',
  'approved',
  'rejected',
  'failed',
] as const;

export type HookClipApprovalState = (typeof HOOK_CLIP_APPROVAL_STATES)[number];

/** Trusted server projection for the hook-first clip review checkpoint. */
export interface HookClipApprovalStatus {
  state: HookClipApprovalState;
  attempt: number;
  remainingClipCount: number;
  hookClipResultId?: string;
  lastAction?: HookClipApprovalAction;
  feedback?: string;
}
