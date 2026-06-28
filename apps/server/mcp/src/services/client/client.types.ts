/**
 * Shared types and constants for the MCP API client family.
 *
 * The client surface used to live in a single 1,800-line `client.service.ts`.
 * It is now split into a {@link BaseApiClient} foundation plus per-domain
 * client classes; these types are the small shared vocabulary between them.
 */

/** Shape of an axios error carrying a JSON:API error envelope. */
export interface ApiError {
  response?: {
    data?: { errors?: Array<{ detail?: string }> };
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
  UNKNOWN: 'unknown',
} as const;
