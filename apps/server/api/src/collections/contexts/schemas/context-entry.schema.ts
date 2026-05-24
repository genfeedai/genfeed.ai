import type { ContextEntry as PrismaContextEntry } from '@genfeedai/prisma';

export type { ContextEntry as PrismaContextEntry } from '@genfeedai/prisma';

export interface ContextEntry extends PrismaContextEntry {
  _id: string;
  content?: string;
  contextBase?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  organization?: string;
  relevanceWeight?: number;
  [key: string]: unknown;
}

export type ContextEntryDocument = ContextEntry;
