import type { KnowledgeRetrievalCitation } from '@genfeedai/contracts/interfaces';
import type { ContextEntry as PrismaContextEntry } from '@genfeedai/prisma';

export type { ContextEntry as PrismaContextEntry } from '@genfeedai/prisma';

export interface ContextEntry extends PrismaContextEntry {
  content?: string;
  contextBase?: string;
  metadata?: Record<string, unknown>;
  relevanceWeight?: number;
  [key: string]: unknown;
}

/** Exact source version a chunk was extracted from; both ids or neither. */
export interface ContextEntryKnowledgeLink {
  knowledgeSourceId: string;
  knowledgeSourceVersionId: string;
}

export type ContextEntryPendingEmbeddingRow = {
  content: string | null;
  id: string;
};

export type ContextEntrySimilarityRow = {
  content: string | null;
  contextBaseId: string;
  kind: string | null;
  knowledgeSourceId: string | null;
  knowledgeSourceKind: string | null;
  knowledgeSourcePurpose: string | null;
  knowledgeSourceTitle: string | null;
  knowledgeSourceUrl: string | null;
  knowledgeSourceVersion: number | null;
  knowledgeSourceVersionId: string | null;
  metadata: unknown;
  similarity: number;
};

export type ContextEntrySimilarityResult = {
  citation?: KnowledgeRetrievalCitation;
  content: string;
  contextBaseId: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  similarity: number;
};

export type ContextEntryDocument = ContextEntry;
