import type { KnowledgeSourcePurpose } from '../../enums/knowledge-source.enum';
import type { KnowledgeRetrievalCitation } from './knowledge-record.interface';

/** Brand-scoped retrieval request over pgvector context entries. */
export interface BrandContentMemoryRetrievalParams {
  brandId: string;
  organizationId: string;
  query: string;
  limit?: number;
  minRelevance?: number;
  /** Explicit Knowledge sources selected for this execution. */
  knowledgeSourceIds?: string[];
  /** Knowledge purposes allowed for this execution; legacy memory stays eligible. */
  knowledgePurposes?: KnowledgeSourcePurpose[];
  /**
   * Restrict hits to chunks linked to a Knowledge source version — legacy,
   * unlinked context entries (uncited) never take a result slot. Callers that
   * require citation identity on every returned passage (automatic chat
   * retrieval) should set this; harness/legacy-memory callers that still
   * accept uncited hits leave it unset.
   */
  isKnowledgeOnly?: boolean;
}

/** One retrieved passage with enough identity to cite it later. */
export interface BrandContentMemoryHit {
  citation?: KnowledgeRetrievalCitation;
  content: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  relevance: number;
  source?: string;
}

/**
 * Automatic retrieval for a thread that has no validated brand: organization
 * scope plus the actor's own personal scope. Never includes brand-owned
 * material — that requires a brand id and {@link BrandContentMemoryRetrievalParams}.
 */
export interface OrgAndPersonalContentMemoryRetrievalParams {
  organizationId: string;
  userId: string;
  query: string;
  limit?: number;
  minRelevance?: number;
}

/**
 * Explicit Knowledge selection for one execution. Sources and spaces are
 * unioned; purposes narrow the union. Empty selection means brand default.
 */
export interface KnowledgeSelection {
  sourceIds?: string[];
  spaceIds?: string[];
  purposes?: KnowledgeSourcePurpose[];
}

/** Resolved retrieval filters derived from a {@link KnowledgeSelection}. */
export interface KnowledgeRetrievalFilters {
  knowledgeSourceIds?: string[];
  knowledgePurposes?: KnowledgeSourcePurpose[];
}

/** Citation plus the passage that reached the model; persisted with outputs. */
export interface KnowledgeReceipt extends KnowledgeRetrievalCitation {
  excerpt: string;
  relevance: number;
}
