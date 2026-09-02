import type {
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';

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
 * A single model endpoint returned by the fal model search API.
 * @see https://fal.ai/docs/platform-apis/v1/models
 */
export interface IFalModel {
  endpoint_id: string;
  openapi?: Record<string, unknown>;
  metadata?: {
    category?: string;
    description?: string;
    display_name?: string;
    model_url?: string;
    status?: string;
    tags?: string[];
    updated_at?: string;
  };
}

/**
 * Cursor-paginated response from the fal model search API
 */
export interface IFalModelsResponse {
  models: IFalModel[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Input for creating a draft model from discovered data
 */
export interface IModelDiscoveryInput {
  /** Provider-side endpoint identity, independent from the public selection key */
  endpoint: string;
  owner: string;
  name: string;
  description: string;
  /** Provider-hosted model page, stored on `providerConfig` for operator review */
  providerUrl: string;
  /** Replicate pins a version; fal endpoints are unversioned and pass null */
  versionId: string | null;
  category: ModelCategory;
  /** Preferred display label; falls back to a title-cased model name */
  label?: string;
  provider: ModelProvider.REPLICATE | ModelProvider.FAL;
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
  /** Synchronized candidates that differ from a reviewed contract */
  providerContractsDrifted?: number;
  /** Candidates blocked by unsupported schema/pricing semantics */
  providerContractsQuarantined?: number;
  /** Endpoint contracts observed in this run */
  providerContractsSynchronized?: number;
}
