import type { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { Model as PrismaModel } from '@genfeedai/prisma';

export type ServerModelDimensions = {
  height: number;
  width: number;
  [key: string]: unknown;
};

export interface ServerModelRecord
  extends Omit<PrismaModel, 'category' | 'config'> {
  _id?: string;
  capabilities?: string[];
  category?: ModelCategory | string;
  config?: Record<string, unknown>;
  cost?: number;
  costTier?: 'high' | 'low' | 'medium' | string;
  description?: string;
  isDefault?: boolean;
  isHighlighted?: boolean;
  key?: string;
  maxDimensions?: ServerModelDimensions;
  organization?: string | null;
  provider?: ModelProvider | string;
  qualityTier?: 'basic' | 'high' | 'standard' | 'ultra' | string;
  recommendedFor?: string[];
  speedTier?: 'fast' | 'medium' | 'slow' | string;
  supportsFeatures?: string[];
  [key: string]: unknown;
}
