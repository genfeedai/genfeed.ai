import type { ServerModelDimensions, ServerModelRecord } from '@api/index';
import type { Model as PrismaModel } from '@genfeedai/prisma';

export type ModelDimensions = ServerModelDimensions;
export type ModelDocument = PrismaModel & ServerModelRecord;
