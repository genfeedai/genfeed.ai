import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  CostTier,
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
  QualityTier,
  SpeedTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';

export class Model extends BaseEntity implements IModel {
  declare public label: string;
  declare public key: string;
  declare public category: ModelCategory;
  declare public provider: ModelProvider;
  declare public cost: number;
  declare public isDefault: boolean;
  declare public isActive: boolean;
  declare public lifecycle: ModelLifecycle;
  declare public description?: string;
  declare public isHighlighted?: boolean;
  declare public trigger?: string;
  declare public capabilities?: string[];
  declare public costTier?: CostTier;
  declare public recommendedFor?: string[];
  declare public speedTier?: SpeedTier;
  declare public qualityTier?: QualityTier;
  declare public supportsFeatures?: string[];
  declare public minDimensions?: { width: number; height: number };
  declare public maxDimensions?: { width: number; height: number };
  declare public pricingType?: PricingType;
  declare public costPerUnit?: number;
  declare public minCost?: number;
  declare public isDiscovered?: boolean;
  declare public isLegacy?: boolean;
  declare public isFree?: boolean;
  declare public succeededBy?: string;
  declare public rejectionReason?: string;
  declare public reviewStatus?: IModel['reviewStatus'];
  declare public reviewedAt?: Date;
  declare public reviewedBy?: string;

  constructor(data: Partial<IModel> = {}) {
    super(data);
  }
}
