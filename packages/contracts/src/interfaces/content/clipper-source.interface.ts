export const CLIPPER_SOURCE_SCHEMA_VERSION = 1 as const;

export const CLIPPER_SOURCE_KINDS = ['youtube', 'upload', 'library'] as const;

export type ClipperSourceKind = (typeof CLIPPER_SOURCE_KINDS)[number];

/** Source kinds a creator picks in the new-project form; Library sources start from their asset. */
export const CLIPPER_DRAFT_SOURCE_KINDS = ['youtube', 'upload'] as const;

export type ClipperDraftSourceKind =
  (typeof CLIPPER_DRAFT_SOURCE_KINDS)[number];

/**
 * Unsubmitted new-project form state kept on a `draft` clip project.
 * An upload draft keeps only the filename; the file itself is re-picked.
 */
export interface ClipperProjectDraft {
  filename?: string;
  sourceKind: ClipperDraftSourceKind;
  updatedAt: string;
  youtubeUrl?: string;
}

export const CLIPPER_SOURCE_STATUSES = [
  'validating',
  'uploading',
  'queued',
  'downloading',
  'extracting',
  'ready-for-transcription',
  'completed',
  'failed',
] as const;

export type ClipperSourceStatus = (typeof CLIPPER_SOURCE_STATUSES)[number];

export const CLIPPER_PROCESSING_FLOWS = ['quick', 'review'] as const;

export type ClipProcessingFlow = (typeof CLIPPER_PROCESSING_FLOWS)[number];

export interface ClipperSourceFailure {
  code: string;
  message: string;
  retryable: boolean;
}

/** Durable media produced or confirmed by ingestion. Never contains a presigned URL. */
export interface ClipperSourceArtifact {
  contentType: string;
  durationSeconds?: number;
  mediaUrl: string;
  storageKey?: string;
}

/**
 * Durable, storage-provider-neutral source state for a Studio clip project.
 * Credentials and presigned URLs must never be persisted in this contract.
 */
export interface ClipperSourceContract {
  schemaVersion: typeof CLIPPER_SOURCE_SCHEMA_VERSION;
  kind: ClipperSourceKind;
  status: ClipperSourceStatus;
  fingerprint: string;
  flow: ClipProcessingFlow;
  retryCount: number;
  maxRetries: number;
  updatedAt: string;
  artifact?: ClipperSourceArtifact;
  contentType?: string;
  durationSeconds?: number;
  failure?: ClipperSourceFailure | null;
  filename?: string;
  ingredientId?: string;
  jobId?: string;
  sizeBytes?: number;
}
