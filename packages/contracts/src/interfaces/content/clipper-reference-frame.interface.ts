export const CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION = 1 as const;

export const CLIPPER_REFERENCE_FRAME_STATUSES = [
  'pending',
  'ready',
  'partial',
  'unavailable',
  'selected',
] as const;

export type ClipperReferenceFrameStatus =
  (typeof CLIPPER_REFERENCE_FRAME_STATUSES)[number];

export const CLIPPER_REFERENCE_FRAME_CANDIDATE_STATUSES = [
  'pending',
  'available',
  'failed',
] as const;

export type ClipperReferenceFrameCandidateStatus =
  (typeof CLIPPER_REFERENCE_FRAME_CANDIDATE_STATUSES)[number];

export const CLIPPER_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES = [
  'info',
  'warning',
  'error',
] as const;

export type ClipperReferenceFrameDiagnosticSeverity =
  (typeof CLIPPER_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES)[number];

export interface ClipperReferenceFrameDiagnostic {
  code: string;
  message: string;
  severity: ClipperReferenceFrameDiagnosticSeverity;
  candidateId?: string;
}

export interface ClipperReferenceFrameCandidate {
  id: string;
  timestampSeconds: number;
  status: ClipperReferenceFrameCandidateStatus;
  assetId?: string;
  storageKey?: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  diagnostics: ClipperReferenceFrameDiagnostic[];
}

export interface ClipperReferenceFrameSet {
  schemaVersion: typeof CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION;
  status: ClipperReferenceFrameStatus;
  candidates: ClipperReferenceFrameCandidate[];
  selectedCandidateId: string | null;
  diagnostics: ClipperReferenceFrameDiagnostic[];
}

export interface ClipperReferenceFrameExtractionInput {
  organizationId: string;
  projectId: string;
  /**
   * Stored source object (upload, Library asset, or materialized YouTube
   * download). Read from the project's own source record, which the API only
   * sets from an org- and brand-authorized source; takes precedence over
   * `sourceUrl`.
   */
  sourceStorageKey?: string;
  sourceUrl: string;
  timestamps: number[];
}

/**
 * Client-facing shape of a clip project read, as consumed by the studio clipper
 * surface. Shared so the API client and the page hook cannot drift.
 */
export interface ClipperProjectReadResponse {
  brandId?: string;
  createdAt?: string;
  draft?: import('./clipper-source.interface').ClipperProjectDraft | null;
  error?: string | null;
  failedClipCount?: number;
  name?: string;
  pendingClipCount?: number;
  progress?: number;
  readyClipCount?: number;
  referenceFrames?: ClipperReferenceFrameSet;
  source?: import('./clipper-source.interface').ClipperSourceContract;
  settings?: {
    maxClips?: number;
    minViralityScore?: number;
    mode?: string;
  };
  transcriptText?: string;
  sourceVideoUrl?: string;
  sourceVideoS3Key?: string;
  status?: string;
}

export const HOOK_CLIPPER_APPROVAL_ACTIONS = [
  'approve',
  'request_changes',
  'reject',
] as const;

export type HookClipApprovalAction =
  (typeof HOOK_CLIPPER_APPROVAL_ACTIONS)[number];

export const HOOK_CLIPPER_APPROVAL_STATES = [
  'not_required',
  'generating_hook',
  'awaiting_confirmation',
  'resuming',
  'approved',
  'rejected',
  'failed',
] as const;

export type HookClipApprovalState =
  (typeof HOOK_CLIPPER_APPROVAL_STATES)[number];

/** Trusted server projection for the hook-first clip review checkpoint. */
export interface HookClipApprovalStatus {
  state: HookClipApprovalState;
  attempt: number;
  remainingClipCount: number;
  hookClipperResultId?: string;
  lastAction?: HookClipApprovalAction;
  feedback?: string;
}
