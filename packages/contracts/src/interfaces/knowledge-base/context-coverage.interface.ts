import type { KnowledgeSourcePurpose } from '../../enums/knowledge-source.enum';

/** What the coverage describes: an explicit search or the automatic answer context. */
export type ContextCoverageUsage = 'context' | 'search';

export type ContextCoverageFamilyName =
  | 'agent_memory'
  | 'knowledge'
  | 'social_connections';

/**
 * `empty` means a complete, authorized inventory with no members; it never
 * says the fact does not exist in the real world. `partial` covers every mix of
 * usable and unusable members, including pending ingestion.
 */
export type ContextCoverageState =
  | 'available'
  | 'disconnected'
  | 'empty'
  | 'failed'
  | 'partial'
  | 'stale';

/**
 * A recovery step the client turns into a link to an existing surface. The
 * server never builds URLs: it does not know the org and brand slugs.
 */
export interface ContextCoverageRecovery {
  kind: 'open_knowledge' | 'reconnect';
  /** Fixed copy or an authorized Knowledge source title; never an account identity. */
  label: string;
  /** Lowercase platform for `reconnect`. */
  platform?: string;
  /** Knowledge source id for `open_knowledge`. */
  sourceId?: string;
  state: ContextCoverageState;
}

export interface ContextCoverageFamily {
  family: ContextCoverageFamilyName;
  /** Most recent genuine success among the authorized members; null when none is recorded. */
  lastSuccessAt: string | null;
  /** Present only for the `knowledge` family. */
  purpose?: KnowledgeSourcePurpose;
  /** At most five authorized recovery steps. */
  recoveries: ContextCoverageRecovery[];
  state: ContextCoverageState;
}

export interface ContextCoverage {
  families: ContextCoverageFamily[];
  /** True when any included family is partial, stale, disconnected or failed. */
  isIncomplete: boolean;
  usage: ContextCoverageUsage;
}
