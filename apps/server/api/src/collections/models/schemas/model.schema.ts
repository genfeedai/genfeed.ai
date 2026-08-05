import type { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { Model as PrismaModel } from '@genfeedai/prisma';

export type ModelDimensions = {
  height: number;
  width: number;
  [key: string]: unknown;
};

export interface ModelDocument
  extends Omit<
    PrismaModel,
    'category' | 'config' | 'maxDimensions' | 'minDimensions' | 'provider'
  > {
  category: ModelCategory | string;
  maxDimensions: ModelDimensions | null;
  minDimensions: ModelDimensions | null;
  provider: ModelProvider | string;
  providerConfig: Record<string, unknown>;
}
