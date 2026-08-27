import type { Model as PrismaModel } from '@genfeedai/prisma';
import type {
  ServerModelDimensions,
  ServerModelRecord,
} from '@genfeedai/server';

export type ModelDimensions = ServerModelDimensions;
export type ModelDocument = PrismaModel & ServerModelRecord;
