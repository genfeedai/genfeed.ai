import type {
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/enums';

/**
 * Raw model data returned from Replicate API
 */
export interface IReplicateModel {
  owner: string;
  name: string;
  description: string;
  url: string;
  default_example: {
    completed_at?: string;
    created_at?: string;
  } | null;
  latest_version: {
    id: string;
    created_at: string;
    cog_version: string;
    openapi_schema: Record<string, unknown>;
  } | null;
  visibility: string;
  run_count: number;
}

/**
 * Paginated response from Replicate API
 */
export interface IReplicateModelsResponse {
  results: IReplicateModel[];
  next: string | null;
  previous: string | null;
}

/**
 * Version detail from Replicate API including OpenAPI schema
 */
export interface IReplicateVersionDetail {
  id: string;
  created_at: string;
  cog_version: string;
  openapi_schema: Record<string, unknown>;
}

/**
 * Input for creating a draft model from discovered data
 */
export interface IModelDiscoveryInput {
  owner: string;
  name: string;
  description: string;
  replicateUrl: string;
  versionId: string | null;
  category: ModelCategory;
  provider: ModelProvider;
  providerCostUsd?: number;
}

/**
 * Result of cost estimation for a new model
 */
export interface IModelPricingEstimate {
  cost: number;
  pricingType: PricingType;
  costPerUnit: number;
  minCost: number;
}

/**
 * Summary of a model discovery run
 */
export interface IModelDiscoveryRunSummary {
  totalPolled: number;
  newModelsFound: number;
  draftsCreated: number;
  errors: number;
  timestamp: Date;
  falPolled?: number;
  falNewFound?: number;
  falDraftsCreated?: number;
}
