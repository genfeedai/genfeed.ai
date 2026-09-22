import type {
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import type { TypedDecisionMode } from '@genfeedai/contracts/interfaces';

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
  /**
   * Confidence of the typed category decision (#4869). Only set when a
   * provider answered; the keyword table and the schema sniffer carry none.
   */
  categoryConfidence?: number;
}

/**
 * Resolved rollout gate for the model-discovery category decision (#4869).
 * Produced by `resolveModelDiscoveryDecisionSettings`.
 */
export interface IModelDiscoveryDecisionSettings {
  /** 0..1. A provider answer below this is treated exactly like `null`. */
  minConfidence: number;
  mode: TypedDecisionMode;
}

/** Which layer of the three-layer resolution produced a category (#4869). */
export type ModelCategoryDecisionSource =
  | 'keyword'
  | 'output-schema'
  | 'provider-metadata'
  | 'typed-decision';

/** Everything the category decision is allowed to judge about one model. */
export interface IModelCategoryDetectionInput {
  description?: string;
  /** `owner/name` on Replicate, the endpoint id on fal. */
  endpoint: string;
  provider: ModelProvider;
  /** Provider OpenAPI document, when discovery managed to fetch one. */
  schema?: Record<string, unknown>;
  /** Provider-published labels (fal's task category, marketplace tags). */
  tags?: readonly string[];
}

/** Outcome of the three-layer category resolution (#4869). */
export interface IModelCategoryDecision {
  category: ModelCategory;
  /**
   * Provider confidence, recorded whenever a provider answered — including
   * when it was too low to act on, which is exactly the case the admin
   * registry review needs to see.
   */
  confidence?: number;
  source: ModelCategoryDecisionSource;
}

/**
 * A category read straight off the provider's output schema, plus whether that
 * read is strong enough to skip the decision provider entirely.
 */
export interface IOutputSchemaCategorySignal {
  category: ModelCategory;
  /**
   * True only for a positive structural statement (`video/mp4`, an audio
   * description). Negative inference — "a bare string is probably text" — is
   * still worth using as the deterministic answer but never short-circuits.
   */
  isUnambiguous: boolean;
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
