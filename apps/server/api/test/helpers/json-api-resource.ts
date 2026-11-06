import type { JsonApiDocument, JsonApiResource } from '@genfeedai/serializers';

/**
 * The attributes of a JSON:API document that holds exactly one resource.
 * Throws when the document holds a list, nothing, or a resource without
 * attributes, so a spec fails on the shape instead of reading `undefined`.
 */
export function singleResourceAttributes(
  document: JsonApiDocument,
): Record<string, unknown> {
  if (
    !document.data ||
    Array.isArray(document.data) ||
    document.data.attributes === undefined
  ) {
    throw new Error('Expected a JSON:API document with one resource');
  }

  return document.data.attributes;
}

/**
 * A serializer stub that echoes its input back as the document's `data`, so
 * controller specs can assert on the records the controller handed over.
 */
export function echoSerialize(data: unknown): JsonApiDocument {
  return { data: data as JsonApiResource };
}
