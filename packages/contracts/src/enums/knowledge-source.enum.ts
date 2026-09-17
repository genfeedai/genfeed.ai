export enum KnowledgeMemoryScope {
  PERSONAL = 'personal',
  BRAND = 'brand',
  ORG = 'org',
}

export enum KnowledgeSourceKind {
  TEXT = 'TEXT',
  URL = 'URL',
  FILE = 'FILE',
  DOCUMENT = 'DOCUMENT',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  RSS = 'RSS',
}

export enum KnowledgeSourcePurpose {
  BRAND_TRUTH = 'BRAND_TRUTH',
  INSPIRATION = 'INSPIRATION',
  RESEARCH = 'RESEARCH',
}

export enum KnowledgeProcessingState {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum KnowledgeRetrievalState {
  ACTIVE = 'ACTIVE',
  STALE = 'STALE',
  CONTRADICTED = 'CONTRADICTED',
  SUPERSEDED = 'SUPERSEDED',
  QUARANTINED = 'QUARANTINED',
  EXPIRED = 'EXPIRED',
}

export enum KnowledgeRetentionState {
  RETAINED = 'RETAINED',
  SCHEDULED_FOR_PURGE = 'SCHEDULED_FOR_PURGE',
  PAYLOAD_PURGED = 'PAYLOAD_PURGED',
  /** Reserved for explicit governance policy; payload purge never implies erasure. */
  POLICY_ERASED = 'POLICY_ERASED',
}

export enum KnowledgeRetentionPolicy {
  KEEP = 'KEEP',
  UNTIL_EXPIRY = 'UNTIL_EXPIRY',
}

export enum KnowledgeSourceSyncState {
  CURRENT = 'CURRENT',
  CHECKING = 'CHECKING',
  STALE = 'STALE',
  FAILED = 'FAILED',
}

export enum KnowledgeRefreshRunStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum KnowledgeRefreshRunOutcome {
  CHANGED = 'CHANGED',
  UNCHANGED = 'UNCHANGED',
  SKIPPED = 'SKIPPED',
}

export enum KnowledgeTranscriptState {
  RESOLVED = 'resolved',
  GENERATED = 'generated',
  UNAVAILABLE = 'unavailable',
  PROHIBITED = 'prohibited',
}

export const KNOWLEDGE_URL_REFRESH_INTERVAL_MINUTES = 1_440;
export const KNOWLEDGE_URL_REFRESH_GRACE_MINUTES = 10_080;
export const KNOWLEDGE_RSS_REFRESH_INTERVAL_MINUTES = 60;
export const KNOWLEDGE_RSS_REFRESH_GRACE_MINUTES = 43_200;
export const KNOWLEDGE_REFRESH_INTERVAL_MIN = 15;
export const KNOWLEDGE_REFRESH_INTERVAL_MAX = 10_080;
export const KNOWLEDGE_REFRESH_GRACE_MIN = 60;
export const KNOWLEDGE_REFRESH_GRACE_MAX = 129_600;
export const KNOWLEDGE_CAPTURE_TRANSCRIPT_CREDIT = 1;
