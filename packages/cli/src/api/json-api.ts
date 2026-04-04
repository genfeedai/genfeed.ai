import {
  getDeserializer,
  isDeserializerRuntime,
  type JsonApiDocument,
} from '@genfeedai/deserializer';

// Re-export types used by other files
export type { JsonApiDocument } from '@genfeedai/deserializer';

// Backward-compatible type aliases (CLI commands reference these)
export type JsonApiCollectionResponse = JsonApiDocument;
export type JsonApiSingleResponse = JsonApiDocument;
type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isJsonApiResource(value: unknown): value is JsonApiResource {
  return isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string';
}

/**
 * Legacy helper kept for unit-test compatibility.
 * New code should prefer `flattenSingle` / `flattenCollection`.
 */
export function flattenResource<T>(resource: JsonApiResource): T {
  return {
    ...(resource.attributes ?? {}),
    id: resource.id,
  } as T;
}

/**
 * Legacy helper kept for unit-test compatibility.
 */
export function isJsonApiResponse(response: unknown): boolean {
  if (!isRecord(response) || !('data' in response)) return false;

  const data = response.data;

  if (Array.isArray(data)) {
    return data.length === 0 || data.every((item) => isJsonApiResource(item));
  }

  return isJsonApiResource(data);
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
