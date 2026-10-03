import type { ImportedSourceRecord } from '@api/collections/imported-sources/services/imported-source-state';
import type {
  ImportedSourceEnvelope,
  ImportedSourceSnapshot,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import type {
  ImportedSourceMediaBinding,
  ImportedSourceMediaView,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import type { Ingredient } from '@genfeedai/prisma';
export interface AgentSourceIngestInput {
  url?: string;
  ingredientId?: string;
  title?: string;
  kind?: 'video' | 'image' | 'audio';
}
export interface AgentSourceIngestContext {
  organizationId: string;
  brandId?: string;
  userId: string;
  threadId: string;
}
export interface AgentSourceArtifact {
  publicUrl: string;
  storageKey: string;
  kind: 'video' | 'image' | 'audio';
  extension:
    | 'JPEG'
    | 'PNG'
    | 'GIF'
    | 'WEBP'
    | 'MP4'
    | 'WEBM'
    | 'MOV'
    | 'MP3'
    | 'WAV';
  width: number;
  height: number;
  duration: number;
  size: number;
  hasAudio: boolean;
}

export interface AgentSourceDownloadScope {
  organizationId: string;
  userId: string;
}
export interface AgentSourceDownloadOptions {
  requeueMissingJob?: boolean;
  requireJobIdentity?: boolean;
}
export type AgentSourceJobObservation =
  | { state: 'pending' }
  | { state: 'failed' }
  | { state: 'missing' }
  | { state: 'uncertain' }
  | { state: 'ready'; artifact: AgentSourceArtifact };
export type AgentSourceJobEnvelopeObservation =
  | { state: 'pending' }
  | { state: 'failed' }
  | { state: 'uncertain' }
  | {
      state: 'completed';
      sourceUrl: string;
      sourceS3Key: string;
      sourceDurationSeconds?: number;
    };

export interface AgentImportedSourceIngestScope {
  organizationId: string;
  brandId: string;
  userId: string;
}
export interface SourceCaptureIngest {
  version: 1;
  sourceId: string;
  sourceIdentityDigest: string;
  mediaUrlDigest: string;
  mediaKind: 'image' | 'video' | 'audio';
  actorUserId: string;
  ingestRevision: number;
  attemptId: string;
  requestId: string;
  retryFromRevision?: number;
  storageId: string;
  startedAt: string;
  leaseUntil: string;
  state: 'claimed' | 'submitted' | 'ready' | 'failed' | 'uncertain';
  jobId?: string;
  errorCode?: ImportedSourceMediaView['errorCode'];
}
export type AgentImportedMediaRecord = Pick<
  Ingredient,
  | 'id'
  | 'organizationId'
  | 'brandId'
  | 'version'
  | 'sourceActionId'
  | 'providerData'
  | 'isDeleted'
  | 'category'
  | 'status'
  | 's3Key'
  | 'createdAt'
  | 'updatedAt'
>;
export interface ImportedSourceMediaProjectionInput {
  sourceId: string;
  sourceRecordVersion: number;
  sourceIdentityDigest: string;
  scope: AgentImportedSourceIngestScope;
  binding?: ImportedSourceMediaBinding;
  media?: AgentImportedMediaRecord;
  ingest?: SourceCaptureIngest;
  unavailable?: boolean;
}

export interface AgentImportedSourceIngestInput {
  sourceId: string;
  sourceIdentityDigest: string;
  sourceRecordVersion: number;
  title: string;
  selectedMedia?: ImportedSourceSnapshot['selectedMedia'];
  requestId?: string;
  expectedIngestRevision?: number;
}
export interface AgentImportedSourceState {
  source: ImportedSourceRecord;
  envelope: ImportedSourceEnvelope;
  binding?: ImportedSourceMediaBinding;
  media?: AgentImportedMediaRecord;
  ingest?: SourceCaptureIngest;
}
export interface AgentImportedSourceClaim {
  state: AgentImportedSourceState;
  claimed: boolean;
}

export interface AgentImportedSourceAttemptState
  extends AgentImportedSourceState {
  binding: ImportedSourceMediaBinding;
  media: AgentImportedMediaRecord;
  ingest: SourceCaptureIngest;
}

export type AgentImportedSourceCompletionOutcome =
  | { kind: 'ready'; state: AgentImportedSourceState }
  | { kind: 'source_missing' };
