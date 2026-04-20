import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { ModelCategory, ModelProvider, PricingType } from '@genfeedai/enums';
import { type Model } from '@genfeedai/prisma';

export class ModelEntity extends BaseEntity implements Model {
  declare readonly label: string;
  declare readonly provider: ModelProvider;
  declare readonly key: string;
  declare readonly category: ModelCategory;
  declare readonly cost: number;
  declare readonly isActive: boolean;
  declare readonly description?: string;
  declare readonly isHighlighted: boolean;
  declare readonly isDefault: boolean;

  // Dynamic pricing fields
  declare readonly pricingType?: PricingType | 'per-token';
  declare readonly costPerUnit?: number;
  declare readonly minCost?: number;
  declare readonly inputCostPerMillionTokens?: number;
  declare readonly outputCostPerMillionTokens?: number;
}
