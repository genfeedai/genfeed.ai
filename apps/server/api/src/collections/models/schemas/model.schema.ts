import type { ServerModelDimensions, ServerModelRecord } from '@api/index';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { Model as PrismaModel } from '@genfeedai/prisma';

export type ModelDimensions = ServerModelDimensions;
export type ModelDocument = PrismaModel &
  ServerModelRecord &
  Pick<IModel, 'aliases'>;
