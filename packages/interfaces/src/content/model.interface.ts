import type {
  CostTier,
  ModelCategory,
  ModelProvider,
  PricingType,
  QualityTier,
  SpeedTier,
} from '@genfeedai/enums';
import type { IBaseEntity } from '../index';

export interface IModel extends IBaseEntity {
  label: string;
  key: string;
  category: ModelCategory;
  provider: ModelProvider;
  cost: number;
  isActive: boolean;
  isDefault: boolean;
  description?: string;
  isHighlighted?: boolean;
  trigger?: string;
  categoryBadgeClass?: string;
  providerBadgeClass?: string;
  capabilities?: string[];
  costTier?: CostTier;
  recommendedFor?: string[];
  speedTier?: SpeedTier;
  qualityTier?: QualityTier;
  supportsFeatures?: string[];
  minDimensions?: { width: number; height: number };
  maxDimensions?: { width: number; height: number };
  pricingType?: PricingType;
  costPerUnit?: number;
  minCost?: number;
  providerCostUsd?: number;

  // Output capability fields (from DB)
  aspectRatios?: string[];
  defaultAspectRatio?: string;
  maxOutputs?: number;
  maxReferences?: number;
  isBatchSupported?: boolean;
  durations?: number[];
  defaultDuration?: number;
  hasEndFrame?: boolean;
  hasInterpolation?: boolean;
  hasSpeech?: boolean;
  hasAudioToggle?: boolean;
  hasResolutionOptions?: boolean;
  isImagenModel?: boolean;
  isReferencesMandatory?: boolean;
  usesOrientation?: boolean;
  hasDurationEditing?: boolean;

  // Lifecycle fields
  succeededBy?: string;
  predecessorOf?: string;

  // Provider auto-discovery fields (issue #93)
  isPublic?: boolean;
  isLegacy?: boolean;
  isDiscovered?: boolean;
  discoveredAt?: Date;
  lastSyncedAt?: Date;
  margin?: number;
}
