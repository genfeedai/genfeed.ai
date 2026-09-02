import type { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type { Model as PrismaModel } from '@genfeedai/prisma';

export type ServerModelDimensions = {
  height: number;
  width: number;
  [key: string]: unknown;
};

export interface ServerModelRecord
  extends Omit<
    PrismaModel,
    'category' | 'config' | 'maxDimensions' | 'minDimensions' | 'provider'
  > {
  category: ModelCategory | string;
  endpoint: string;
  maxDimensions: ServerModelDimensions | null;
  minDimensions: ServerModelDimensions | null;
  provider: ModelProvider | string;
  providerConfig: Record<string, unknown>;
}
