/** `legacy_snapshot` is what the migration recorded for a memory that predates revisions. */
export const AGENT_MEMORY_REVISION_KINDS = [
  'original',
  'correction',
  'legacy_snapshot',
] as const;

export type AgentMemoryRevisionKind =
  (typeof AGENT_MEMORY_REVISION_KINDS)[number];

/** Where a memory came from, as captured when the revision was written. */
export interface IAgentMemoryRevisionProvenance {
  originalCreatedAt?: string | null;
  sourceContentId?: string | null;
  sourceMessageId?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
}

/**
 * Identifies one exact revision of a memory, so an answer that used the memory
 * can still be explained after the memory is corrected. `createdAt` is when the
 * memory was first captured; `revisionCreatedAt` is when this revision was written.
 */
export interface IAgentMemoryRevisionReference {
  createdAt: string;
  memoryId: string;
  revision: number;
  revisionCreatedAt: string;
  revisionId: string;
  scope: 'personal' | 'brand' | 'org';
}

/** One immutable revision as the history endpoints return it. */
export interface IAgentMemoryRevision {
  actorUserId?: string | null;
  confidence?: number | null;
  content: string;
  createdAt: string;
  id: string;
  importance?: number | null;
  isCurrent: boolean;
  kind: AgentMemoryRevisionKind;
  memoryId: string;
  provenance: IAgentMemoryRevisionProvenance;
  reason?: string | null;
  revision: number;
  summary?: string | null;
  tags: string[];
}

/** Body of a memory correction. */
export interface ICorrectAgentMemoryInput {
  content: string;
  /** The revision the caller read; a stale value is refused rather than merged. */
  expectedRevisionId: string;
  importance?: number;
  reason: string;
  /** Idempotency key: repeating a request with the same key returns the same revision. */
  requestId: string;
  summary?: string;
  tags?: string[];
}
