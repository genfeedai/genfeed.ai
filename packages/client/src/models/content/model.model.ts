import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  CostTier,
  ModelCategory,
  ModelProvider,
  PricingType,
  QualityTier,
  SpeedTier,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';

export class Model extends BaseEntity implements IModel {
  public declare label: string;
  public declare key: string;
  public declare category: ModelCategory;
  public declare provider: ModelProvider;
  public declare cost: number;
  public declare isDefault: boolean;
  public declare isActive: boolean;
  public declare description?: string;
  public declare isHighlighted?: boolean;
  public declare trigger?: string;
  public declare capabilities?: string[];
  public declare costTier?: CostTier;
  public declare recommendedFor?: string[];
  public declare speedTier?: SpeedTier;
  public declare qualityTier?: QualityTier;
  public declare supportsFeatures?: string[];
  public declare minDimensions?: { width: number; height: number };
  public declare maxDimensions?: { width: number; height: number };
  public declare pricingType?: PricingType;
  public declare costPerUnit?: number;
  public declare minCost?: number;

  constructor(data: Partial<IModel> = {}) {
    super(data);
  }
}
