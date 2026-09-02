export const CLIP_SOURCE_SCHEMA_VERSION = 1 as const;

export const CLIP_SOURCE_KINDS = ['youtube', 'upload'] as const;

export type ClipSourceKind = (typeof CLIP_SOURCE_KINDS)[number];

export const CLIP_SOURCE_STATUSES = [
  'validating',
  'uploading',
  'queued',
  'downloading',
  'extracting',
  'ready-for-transcription',
  'completed',
  'failed',
] as const;

export type ClipSourceStatus = (typeof CLIP_SOURCE_STATUSES)[number];

export const CLIP_PROCESSING_FLOWS = ['quick', 'review'] as const;

export type ClipProcessingFlow = (typeof CLIP_PROCESSING_FLOWS)[number];

export interface ClipSourceFailure {
  code: string;
  message: string;
  retryable: boolean;
}

/** Durable media produced or confirmed by ingestion. Never contains a presigned URL. */
export interface ClipSourceArtifact {
  contentType: string;
  durationSeconds?: number;
  mediaUrl: string;
  storageKey?: string;
}

/**
 * Durable, storage-provider-neutral source state for a Studio clip project.
 * Credentials and presigned URLs must never be persisted in this contract.
 */
export interface ClipSourceContract {
  schemaVersion: typeof CLIP_SOURCE_SCHEMA_VERSION;
  kind: ClipSourceKind;
  status: ClipSourceStatus;
  fingerprint: string;
  flow: ClipProcessingFlow;
  retryCount: number;
  maxRetries: number;
  updatedAt: string;
  artifact?: ClipSourceArtifact;
  contentType?: string;
  durationSeconds?: number;
  failure?: ClipSourceFailure | null;
  filename?: string;
  ingredientId?: string;
  jobId?: string;
  sizeBytes?: number;
}
