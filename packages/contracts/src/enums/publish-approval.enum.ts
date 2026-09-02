/** Durable lifecycle of one version-bound publish approval. */
export enum PublishApprovalStatus {
  APPROVED = 'approved',
  QUEUED = 'queued',
  EXECUTING = 'executing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  INVALIDATED = 'invalidated',
}

/** The only policy accepted by the v1 version-bound publish boundary. */
export enum PublishApprovalPolicyId {
  VERSION_BOUND_V1 = 'version-bound-publish-v1',
}
