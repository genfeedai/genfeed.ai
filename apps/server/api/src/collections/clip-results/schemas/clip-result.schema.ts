import type { ClipResult as PrismaClipResult } from '@genfeedai/prisma';

export interface ClipResultDocument extends PrismaClipResult {
  _id: string;
  project?: string | null;
  projectId?: string | null;
  providerJobId?: string | null;
  status?: string | null;
  videoUrl?: string | null;
  [key: string]: unknown;
}

export type { PrismaClipResult as ClipResult };
