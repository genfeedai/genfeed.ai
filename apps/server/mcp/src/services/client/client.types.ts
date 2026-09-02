import type { AdsPlatform } from '@genfeedai/contracts/interfaces';

/**
 * Shared types and constants for the MCP API client family.
 *
 * The client surface used to live in a single 1,800-line `client.service.ts`.
 * It is now split into a {@link BaseApiClient} foundation plus per-domain
 * client classes; these types are the small shared vocabulary between them.
 */

export interface ApiErrorResponseData {
  errors?: Array<{ detail?: string; title?: string; status?: string }>;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

/** Shape of an axios error carrying a JSON:API error envelope. */
export interface ApiError {
  response?: {
    status?: number;
    data?: ApiErrorResponseData;
  };
  message?: string;
}

export interface BrandResponse {
  id: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

export interface PersonaResponse {
  id: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Query shape for the platform-generic ads gateway insight routes. `entityId`
 * is the ad set/ad group ID or the ad ID depending on the route; every other
 * field maps 1:1 onto a gateway query parameter.
 */
export interface AdsGatewayInsightsParams {
  platform: AdsPlatform;
  credentialId: string;
  adAccountId: string;
  entityId: string;
  datePreset?: string;
  since?: string;
  until?: string;
  loginCustomerId?: string;
}

export interface CreateBatchParams {
  brandId: string;
  count: number;
  platforms: string[];
  topics?: string[];
  dateRange?: { start: string; end: string };
  style?: string;
}

export interface ListBatchesParams {
  batchId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/**
 * Minimal JSON:API resource shape used in map callbacks across workspace,
 * ads, and other client files. Centralised here to avoid the same inline
 * object literal being repeated in every client.
 */
export interface JsonApiResource {
  id?: string;
  attributes?: Record<string, unknown>;
}

/**
 * Canonical fallback status strings for resource responses. Centralized here so
 * the defaults no longer drift across methods (e.g. a created resource is
 * `processing`, a listed one is `completed`). Values are unchanged from the
 * previous inline literals.
 */
export const CONTENT_STATUS = {
  COMPLETED: 'completed',
  DRAFT: 'draft',
  PENDING: 'pending',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  STARTED: 'started',
  UNKNOWN: 'unknown',
} as const;
