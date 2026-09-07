import type {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeRetentionPolicy,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '../../enums/knowledge-source.enum';

export interface KnowledgeRecordOwnership {
  organizationId: string;
  brandId: string | null;
  userId: string;
  scope: KnowledgeMemoryScope;
}

export interface KnowledgeRecord extends KnowledgeRecordOwnership {
  id: string;
  title: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Canonical durable source. Legacy KnowledgeSource describes Context JSON only. */
export interface KnowledgeSourceRecord extends KnowledgeRecord {
  kind: KnowledgeSourceKind;
  purpose: KnowledgeSourcePurpose;
  isVisible: boolean;
}

/** Minimal receipt identity survives supersession and payload purge. */
export interface KnowledgeSourceReceiptIdentity {
  id: string;
  sourceId: string;
  organizationId: string;
  version: number;
  contentHash: string;
}

export interface KnowledgeSourceVersionRecord
  extends KnowledgeSourceReceiptIdentity {
  provenance: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  processingState: KnowledgeProcessingState;
  processingError: string | null;
  retrievalState: KnowledgeRetrievalState;
  retentionState: KnowledgeRetentionState;
  retentionPolicy: KnowledgeRetentionPolicy;
  observedAt: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  purgeScheduledAt: string | null;
  purgedAt: string | null;
  supersededByVersionId: string | null;
  isCurrent: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSpaceRecord extends KnowledgeRecord {
  isInbox: boolean;
}

export interface KnowledgeSpaceMembershipRecord {
  id: string;
  organizationId: string;
  sourceId: string;
  spaceId: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Stable identity of the source version behind one retrieved passage. Enough
 * to persist a receipt and render a citation after the payload is purged.
 */
export interface KnowledgeRetrievalCitation {
  sourceId: string;
  versionId: string;
  version: number;
  title: string;
  kind: KnowledgeSourceKind;
  purpose: KnowledgeSourcePurpose;
  url?: string;
}

/** Captured content stored on a source version until payload purge. */
export interface KnowledgeSourceCapturePayload {
  text?: string;
  referenceUrl?: string;
}

/** Where and when a capture happened; cleared on payload purge. */
export interface KnowledgeSourceCaptureProvenance {
  capturedAt: string;
  capturedBy: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

/** `POST /knowledge-sources` body: metadata plus an optional first capture. */
export interface KnowledgeSourceCaptureRequest {
  scope: KnowledgeMemoryScope;
  title: string;
  kind: KnowledgeSourceKind;
  purpose: KnowledgeSourcePurpose;
  text?: string;
  referenceUrl?: string;
  provenance?: Record<string, unknown>;
}

/** `PATCH /knowledge-sources/:id` body. */
export interface KnowledgeSourceUpdateRequest {
  title?: string;
  purpose?: KnowledgeSourcePurpose;
  isVisible?: boolean;
}

/** Capture response: the source plus the ingestion handle when content was sent. */
export interface KnowledgeSourceCaptureResult {
  source: KnowledgeSourceRecord;
  jobId?: string;
  versionId?: string;
}

/** One legacy row the backfill could not convert safely. */
export interface KnowledgeLegacyQuarantine {
  id: string;
  kind: 'bookmark' | 'context-source';
  reason: string;
}

/** Outcome of one organization's legacy Knowledge backfill run. */
export interface KnowledgeLegacyBackfillReport {
  organizationId: string;
  bookmarks: { migrated: number; skipped: number; quarantined: number };
  contextSources: {
    migrated: number;
    relinkedChunks: number;
    skipped: number;
    quarantined: number;
  };
  spacesCreated: number;
  quarantine: KnowledgeLegacyQuarantine[];
  completedAt: string;
}
