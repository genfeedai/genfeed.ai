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

export interface GeneratedApiRequest {
  method: string;
  path: string;
  query: Record<string, unknown>;
  body?: unknown;
  operationLabel: string;
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
