import { ModelCategory } from '@genfeedai/contracts';

export interface PromptAnalysis {
  complexity: 'simple' | 'medium' | 'complex';
  keywords: string[];
  hasSpecificStyle: boolean;
  hasQualityIndicators: boolean;
  hasSpeedIndicators: boolean;
  estimatedLength: number;
  detectedFeatures: string[];
}

export interface ModelSelectionOptions {
  /** Admission restricts ranking and alternatives to compatible models. Empty means none. */
  eligibleModelKeys?: readonly string[];
  category: ModelCategory;
  prompt: string;
  prioritize?: 'quality' | 'speed' | 'cost' | 'balanced';
  dimensions?: {
    width?: number;
    height?: number;
  };
  duration?: number;
  speech?: string;
  outputs?: number;
  /**
   * Makes org-private registry rows (customer trainings, BYO models) eligible
   * for selection. Omitted, only platform rows are considered.
   */
  organizationId?: string;
}

/**
 * Where a resolved key came from. `fallback-constant` means the registry held
 * no usable row and the last-resort constant was used — a broken install, not
 * a normal outcome.
 */
export type ModelResolutionSource =
  | 'candidate'
  | 'fallback-constant'
  | 'registry-best'
  | 'registry-default';

export interface ModelResolutionRequest {
  /** Optional read-only admission boundary; preserves registry default/rank within this eligible set. */
  eligibleModelKeys?: readonly string[];
  category: ModelCategory;
  /**
   * Preferred keys in precedence order — typically the explicit request, then
   * the brand default, then the organization default. Each is honoured only if
   * the registry carries it as an active, non-legacy row for the category.
   */
  candidates?: Array<string | null | undefined>;
  /** Same scoping rule as `ModelSelectionOptions.organizationId`. */
  organizationId?: string;
}

export interface ModelResolution {
  key: string;
  source: ModelResolutionSource;
}

export interface ModelRecommendation {
  selectedModel: string;
  reason: string;
  modelDetails: {
    id: string;
    key: string;
    provider: string;
    category: ModelCategory;
    cost?: number;
  };
  alternatives: Array<{
    model: string;
    reason: string;
    score: number;
  }>;
  analysis: PromptAnalysis;
}

export interface ModelCapabilities {
  key: string;
  provider: string;
  category: ModelCategory;
  capabilities: string[];
  costTier: 'low' | 'medium' | 'high';
  recommendedFor: string[];
  minDimensions?: { width: number; height: number };
  maxDimensions?: { width: number; height: number };
  supportsFeatures?: string[];
  speedTier: 'fast' | 'medium' | 'slow';
  qualityTier: 'basic' | 'standard' | 'high' | 'ultra';
}

export interface DefaultGenerationAffordabilityInput {
  organizationId: string;
  /** Authoritative wallet balance, already read by the caller. */
  balance: number;
  /** The organization's own default image model setting, when it has one. */
  organizationDefaultImageModel?: string | null;
}
