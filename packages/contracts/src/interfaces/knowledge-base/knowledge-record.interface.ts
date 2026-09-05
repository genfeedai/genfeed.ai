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
