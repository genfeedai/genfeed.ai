/**
 * Knowledge-source ingest: fetch/extract → chunk → embed into ContextEntry.
 *
 * KnowledgeBase is ContextBase + source records in `data.sources`. There is
 * no separate vector product; chunks land on the per-brand ContextBase.
 */
export const KNOWLEDGE_SOURCE_INGEST_JOB_NAME = 'ingest-knowledge-source';
export const KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME = 'backfill-knowledge-sources';

export interface KnowledgeSourceIngestJobData {
  contextBaseId: string;
  organizationId: string;
  sourceId: string;
}

export interface KnowledgeSourceBackfillJobData {
  /** Omit to scan every tenant. Operator/backfill-only. */
  organizationId?: string;
}
