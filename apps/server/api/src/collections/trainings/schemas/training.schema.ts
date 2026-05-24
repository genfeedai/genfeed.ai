import type { Training as PrismaTraining } from '@genfeedai/prisma';

export interface TrainingDocument extends PrismaTraining {
  _id: string;
  brand?: string | null;
  organization?: string;
  user?: string;
  model?: string | null;
  [key: string]: unknown;
}

export type Training = TrainingDocument;
