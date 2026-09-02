import { BaseEntity } from '@api/entities/base.entity';
import {
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';

export class ModelEntity extends BaseEntity {
  declare readonly organizationId: string | null;
  declare readonly externalId: string | null;
  declare readonly providerConfig: Record<string, unknown>;
  declare readonly trainingId: string | null;
  declare readonly parentModelId: string | null;
  declare readonly label: string;
  declare readonly provider: ModelProvider;
  declare readonly key: string;
  declare readonly endpoint: string;
  declare readonly category: ModelCategory;
  declare readonly cost: number;
  declare readonly isActive: boolean;
  declare readonly description: string | null;
  declare readonly isHighlighted: boolean;
  declare readonly isDefault: boolean;

  declare readonly pricingType: PricingType | 'per-token' | null;
  declare readonly costPerUnit: number | null;
  declare readonly minCost: number | null;
  declare readonly inputCostPerMillionTokens: number | null;
  declare readonly outputCostPerMillionTokens: number | null;
}
