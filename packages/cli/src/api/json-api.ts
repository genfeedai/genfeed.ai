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
