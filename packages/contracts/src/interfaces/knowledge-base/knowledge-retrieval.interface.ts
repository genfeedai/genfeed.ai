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
