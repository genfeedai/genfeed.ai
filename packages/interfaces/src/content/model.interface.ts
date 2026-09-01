import type {
  CostTier,
  ModelCategory,
  ModelLifecycle,
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
  lifecycle: ModelLifecycle;
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
  providerConfig?: Record<string, unknown>;
  reviewedProviderContractVersion?: string;
  pendingProviderContractVersion?: string;
  providerSchemaFamily?: string;
  providerSyncStatus?: 'failed' | 'fresh' | 'quarantined' | 'review_required';
  providerSchemaSyncedAt?: Date;
  providerPricingSyncedAt?: Date;
  providerSyncFailedAt?: Date;

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
  organizationId?: string;
  parentModelId?: string;
  trainingId?: string;
  isPublic?: boolean;
  isLegacy?: boolean;
  isFree?: boolean;
  isDiscovered?: boolean;
  discoveredAt?: Date;
  lastSyncedAt?: Date;
  margin?: number;
  rejectionReason?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewStatus?: 'approved' | 'legacy' | 'pending' | 'rejected';
}

export interface IModelProviderContractSnapshot {
  billingUnit?: string;
  conditionalDimensions: Record<string, unknown>;
  currency?: string;
  discoveredAt: Date | string;
  inputSchema: Record<string, unknown>;
  lastSeenAt: Date | string;
  mappingStatus: string;
  outputSchema: Record<string, unknown>;
  pricingType?: string;
  reviewStatus: string;
  schemaFamily?: string;
  unitPrice?: string;
  unsupportedReason?: string;
  version: string;
}

export interface IModelProviderContracts {
  endpoint: string;
  pending: IModelProviderContractSnapshot | null;
  provider: string;
  reviewed: IModelProviderContractSnapshot | null;
}
