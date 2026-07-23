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
