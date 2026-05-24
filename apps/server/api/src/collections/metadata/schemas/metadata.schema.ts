import type { Metadata as PrismaMetadata } from '@genfeedai/prisma';

export interface MetadataDocument extends PrismaMetadata {
  _id: string;
  error: string | null;
  externalId: string | null;
  result: string;
  [key: string]: unknown;
}

export type { PrismaMetadata as Metadata };
