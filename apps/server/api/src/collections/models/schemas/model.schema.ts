import type { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { Model as PrismaModel } from '@genfeedai/prisma';

export type ModelDimensions = {
  width: number;
  height: number;
  [key: string]: unknown;
};

export interface ModelDocument extends Omit<PrismaModel, 'config'> {
  _id: string;
  organization?: string | null;
  description?: string;
  category?: ModelCategory | string;
  key?: string;
  provider?: ModelProvider | string;
  cost?: number;
  isDefault?: boolean;
  isHighlighted?: boolean;
  speedTier?: 'fast' | 'medium' | 'slow' | string;
  costTier?: 'low' | 'medium' | 'high' | string;
  qualityTier?: 'basic' | 'standard' | 'high' | 'ultra' | string;
  capabilities?: string[];
  recommendedFor?: string[];
  maxDimensions?: ModelDimensions;
  supportsFeatures?: string[];
  config?: Record<string, unknown>;
  [key: string]: unknown;
}
