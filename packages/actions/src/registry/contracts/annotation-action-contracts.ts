import type { ActionContractSchemas } from './action-contract.interface';
import {
  arraySchema,
  closedObjectSchema,
  JSON_DOCUMENT_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

/**
 * One image in, the saved shapes drawn over it, one new image out. The shapes are validated by the
 * executor (kind, bounds, size limits) before an image is read, so the schema only types the list.
 */
const ANNOTATION_INPUT = closedObjectSchema({
  annotations: arraySchema(JSON_DOCUMENT_SCHEMA),
  brandId: STRING_SCHEMA,
  image: JSON_DOCUMENT_SCHEMA,
});

const ANNOTATION_OUTPUT = closedObjectSchema(
  { id: STRING_SCHEMA, image: STRING_SCHEMA, status: STRING_SCHEMA },
  ['id', 'image', 'status'],
);

export function getAnnotationActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return id === 'annotation'
    ? { inputSchema: ANNOTATION_INPUT, outputSchema: ANNOTATION_OUTPUT }
    : undefined;
}
