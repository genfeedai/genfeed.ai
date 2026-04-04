import type { IPaginationParams } from '@genfeedai/interfaces';
import {
  getDeserializer,
  isDeserializerRuntime,
  type JsonApiDocument,
} from '@helpers/deserializer.helper';

export interface JsonApiResponseDocument extends JsonApiDocument {
  meta?: Record<string, unknown>;
  links?: {
    pagination?: IPaginationParams;
  };
}

function extractData<T>(
  document: JsonApiResponseDocument,
  errorMessage: string,
): T {
  const result = getDeserializer<T>(document);

  if (isDeserializerRuntime(result)) {
    throw new TypeError(errorMessage);
  }

  return result;
}

export function deserializeResource<T>(document: JsonApiResponseDocument): T {
  return extractData<T>(
    document,
    'Invalid JSON:API document: expected resource data',
  );
}

export function deserializeCollection<T>(
  document: JsonApiResponseDocument,
): T[] {
  const collection = extractData<T[]>(
    document,
    'Invalid JSON:API document: expected collection data',
  );

  if (!Array.isArray(collection)) {
    throw new TypeError(
      'Invalid JSON:API document: expected data to be an array',
    );
  }

  return collection;
}
