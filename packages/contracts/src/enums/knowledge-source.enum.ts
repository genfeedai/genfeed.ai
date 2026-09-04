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
  POLICY_ERASED = 'POLICY_ERASED',
}

export enum KnowledgeRetentionPolicy {
  KEEP = 'KEEP',
  UNTIL_EXPIRY = 'UNTIL_EXPIRY',
}
