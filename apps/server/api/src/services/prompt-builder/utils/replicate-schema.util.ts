import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import type {
  ImageReferenceField,
  ReplicateModelSchema,
} from '@api/services/prompt-builder/interfaces/replicate-schema.interface';
import { IMAGE_REFERENCE_FIELDS } from '@api/services/prompt-builder/interfaces/replicate-schema.interface';
import { ErrorCode } from '@genfeedai/contracts';
import { HttpStatus } from '@nestjs/common';

/**
 * Derives a stable model slug from a Replicate model ID.
 *
 * Model IDs follow the pattern `owner/model-name` (e.g. `google/imagen-4`).
 * Version hashes are omitted so provider-specific routing works for both the
 * model endpoint and an exact version reference.
 */
export function replicateModelIdToSlug(modelId: string): string {
  const withoutVersion = modelId.split(':')[0];
  const parts = withoutVersion.split('/');
  return parts.length >= 2 ? parts[parts.length - 1] : withoutVersion;
}

/**
 * Resolves only a reviewed database contract projection. Unreviewed models do
 * not receive schema-aware behavior and instead use the builders' safe generic
 * defaults until their pending provider contract is approved.
 */
export function resolveModelSchema(
  reviewedSchema?: Record<string, unknown>,
): ReplicateModelSchema | null {
  if (
    reviewedSchema &&
    reviewedSchema.type === 'object' &&
    reviewedSchema.properties &&
    typeof reviewedSchema.properties === 'object' &&
    !Array.isArray(reviewedSchema.properties)
  ) {
    return reviewedSchema as unknown as ReplicateModelSchema;
  }
  return null;
}

/**
 * Detects which image reference field name(s) a schema supports.
 * Returns the field names present in the schema's properties, ordered
 * by preference (array fields first, then single-value fields).
 */
export function detectImageReferenceFields(
  schema: ReplicateModelSchema,
): ImageReferenceField[] {
  const props = schema.properties;
  return IMAGE_REFERENCE_FIELDS.filter((field) => field in props);
}

/**
 * Checks whether a schema property accepts an array of URIs
 * (i.e., multiple image references).
 */
export function isArrayImageField(
  schema: ReplicateModelSchema,
  field: string,
): boolean {
  const prop = schema.properties[field];
  return prop?.type === 'array' && prop?.items?.format === 'uri';
}

/**
 * Gets the maximum number of items for an array image field,
 * based on the schema description (heuristic parsing).
 * Returns undefined if no limit is specified.
 */
export function getArrayImageLimit(
  schema: ReplicateModelSchema,
  field: string,
): number | undefined {
  const prop = schema.properties[field];
  if (!prop?.description) {
    return undefined;
  }

  // Parse patterns like "Maximum 8 images", "supports up to 14 images",
  // "up to 10 images", "max 4"
  const match = prop.description.match(/(?:maximum|max|up to)\s+(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

/**
 * Checks whether a schema has a given property name.
 */
export function schemaHasField(
  schema: ReplicateModelSchema,
  field: string,
): boolean {
  return field in schema.properties;
}

/**
 * Returns the default value for a schema property, if defined.
 */
export function getSchemaDefault(
  schema: ReplicateModelSchema,
  field: string,
): unknown {
  return schema.properties[field]?.default;
}

const HAILUO_23_FAST_SLUG = 'hailuo-2.3-fast';
const HAILUO_23_FAST_REQUIRED = ['prompt', 'first_frame_image'] as const;
const HTTP_URI_PATTERN = /^https?:\/\/\S+$/i;

function isBlankInputValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

function isHttpUri(value: string): boolean {
  return HTTP_URI_PATTERN.test(value.trim());
}

/**
 * Enforces required fields from the approved provider contract, plus stable
 * model-specific invariants already encoded by dedicated prompt builders.
 * Missing/invalid fields map to the repository-standard 4xx validation
 * exception and never include provider payloads.
 */
export function assertRequiredSchemaInput(
  modelId: string,
  input: Record<string, unknown>,
  reviewedSchema?: Record<string, unknown>,
): void {
  const schema = resolveModelSchema(reviewedSchema);
  const isHailuo23Fast =
    replicateModelIdToSlug(modelId) === HAILUO_23_FAST_SLUG;
  const required =
    schema?.required ?? (isHailuo23Fast ? [...HAILUO_23_FAST_REQUIRED] : []);
  const errors: Array<{ field: string; message: string }> = [];

  for (const field of required) {
    const value = input[field];
    if (isBlankInputValue(value)) {
      errors.push({ field, message: `${field} is required` });
      continue;
    }
    const format = schema?.properties[field]?.format;
    if (
      typeof value === 'string' &&
      (format === 'uri' || field === 'first_frame_image') &&
      !isHttpUri(value)
    ) {
      errors.push({
        field,
        message: `${field} must be a valid image URI`,
      });
    }
  }

  const firstError = errors[0];
  if (!firstError) {
    return;
  }

  ErrorResponse.throw({
    code: ErrorCode.VALIDATION_FAILED,
    detail: firstError.message,
    status: HttpStatus.BAD_REQUEST,
    title: 'Validation failed',
    validationErrors: errors,
  });
}
