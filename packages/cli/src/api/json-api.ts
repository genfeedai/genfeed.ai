import {
  getDeserializer,
  isDeserializerRuntime,
  type JsonApiDocument,
} from '@genfeedai/serializers';

// Re-export types used by other files
export type { JsonApiDocument } from '@genfeedai/serializers';

// Backward-compatible type aliases (CLI commands reference these)
export type JsonApiCollectionResponse = JsonApiDocument;
export type JsonApiSingleResponse = JsonApiDocument;

// Top-level pagination block emitted by the API (`links.pagination`).
// Mirrors the server serializer output in
// apps/server/api/src/helpers/utils/response/response.util.ts (setTopLinks).
export interface JsonApiPagination {
  limit: number;
  page: number;
  pages: number;
  total?: number;
}

type JsonApiPaginatedResponse = JsonApiDocument & {
  links?: {
    pagination?: JsonApiPagination;
  };
};

/**
 * Read the top-level pagination block from a collection response.
 * Returns undefined when the API omits pagination (e.g. non-paginated
 * endpoints), so callers can safely fall back to single-page behaviour.
 */
export function extractPagination(response: JsonApiDocument): JsonApiPagination | undefined {
  const pagination = (response as JsonApiPaginatedResponse).links?.pagination;
  if (!pagination || !Number.isFinite(pagination.pages) || !Number.isFinite(pagination.page)) {
    return undefined;
  }
  return pagination;
}

export function flattenCollection<T>(response: JsonApiDocument): T[] {
  const result = getDeserializer<T[]>(response);
  if (isDeserializerRuntime(result)) {
    return [];
  }
  return result;
}

export function flattenSingle<T>(response: JsonApiDocument): T {
  const result = getDeserializer<T>(response);
  if (isDeserializerRuntime(result)) {
    throw new Error('Invalid JSON:API response: expected resource data');
  }
  return result;
}
