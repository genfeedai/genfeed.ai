import type { ContextEntry as PrismaContextEntry } from '@genfeedai/prisma';

export type { ContextEntry as PrismaContextEntry } from '@genfeedai/prisma';

export interface ContextEntry extends PrismaContextEntry {
  content?: string;
  contextBase?: string;
  metadata?: Record<string, unknown>;
  relevanceWeight?: number;
  [key: string]: unknown;
}

export type ContextEntryPendingEmbeddingRow = {
  content: string | null;
  id: string;
};

export type ContextEntrySimilarityRow = {
  content: string | null;
  contextBaseId: string;
  kind: string | null;
  metadata: unknown;
  similarity: number;
};

export type ContextEntrySimilarityResult = {
  content: string;
  contextBaseId: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  similarity: number;
};

export type ContextEntryDocument = ContextEntry;
