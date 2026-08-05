import type { Training as PrismaTraining } from '@genfeedai/prisma';

export interface TrainingDocument extends PrismaTraining {
  model?: string | null;
  [key: string]: unknown;
}

export type Training = TrainingDocument;
