import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ErrorCode } from '@genfeedai/enums';
import { HttpStatus, Logger } from '@nestjs/common';
import { ErrorResponse } from '@server/helpers/utils/error-response/error-response.util';
import type {
  ImageReferenceField,
  ReplicateModelSchema,
} from '@server/services/prompt-builder/interfaces/replicate-schema.interface';
import { IMAGE_REFERENCE_FIELDS } from '@server/services/prompt-builder/interfaces/replicate-schema.interface';

const logger = new Logger('ReplicateSchemaUtil');
const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveSchemasDir(): string | null {
  const candidates = [
    // Production artifact location (start:prod loads ../dist/apps/api/main)
    join(
      process.cwd(),
      '../dist/apps/api/services/integrations/replicate/schemas',
    ),
    // Local dev/test from api package root
    join(process.cwd(), 'src/services/integrations/replicate/schemas'),
    // Extracted server-domain tests run from the sibling server package while
    // Replicate's generated schema assets remain owned by the API application.
    join(
      moduleDir,
      '../../../../../api/src/services/integrations/replicate/schemas',
    ),
    // Fallback when cwd differs but compiled file structure is preserved
    join(moduleDir, '../../integrations/replicate/schemas'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** In-memory cache: model slug -> parsed schema (null = file not found) */
const schemaCache = new Map<string, ReplicateModelSchema | null>();

/**
 * Derives the schema filename from a Replicate model ID.
 *
 * Model IDs follow the pattern `owner/model-name` (e.g. `google/imagen-4`).
 * Schema files are named `{model-name}.schema.json`.
 *
 * For model IDs that don't follow owner/name (e.g. custom trained models),
 * we use the full ID with `/` replaced by `-`.
 */
export function modelIdToSchemaFilename(modelId: string): string {
  // Strip version hash if present (e.g. "owner/model:abc123")
  const withoutVersion = modelId.split(':')[0];

  // Use model name after the slash if owner/model format
  const parts = withoutVersion.split('/');
  const slug = parts.length >= 2 ? parts[parts.length - 1] : withoutVersion;

  return `${slug}.schema.json`;
}

/**
 * Loads and caches a Replicate model schema by model ID.
 * Returns null if no schema file exists for the model.
 */
export function loadModelSchema(modelId: string): ReplicateModelSchema | null {
  const filename = modelIdToSchemaFilename(modelId);

  if (schemaCache.has(filename)) {
    return schemaCache.get(filename) ?? null;
  }

  const schemasDir = resolveSchemasDir();
  if (!schemasDir) {
    logger.warn('Replicate schemas directory not found; using null fallback');
    schemaCache.set(filename, null);
    return null;
  }

  try {
    const filePath = join(schemasDir, filename);
    const raw = readFileSync(filePath, 'utf-8');
    const schema = JSON.parse(raw) as ReplicateModelSchema;
    schemaCache.set(filename, schema);
    return schema;
  } catch {
    logger.debug(`No schema file found for model "${modelId}" (${filename})`);
    schemaCache.set(filename, null);
    return null;
  }
}

/**
 * Prefer the reviewed database projection. Checked-in JSON remains a
 * compatibility fallback for legacy rows that have not promoted a provider
 * contract yet.
 */
export function resolveModelSchema(
  modelId: string,
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
  return loadModelSchema(modelId);
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

/**
 * Clears the schema cache (useful for testing).
 */
export function clearSchemaCache(): void {
  schemaCache.clear();
}

const HAILUO_23_FAST_SCHEMA = 'hailuo-2.3-fast.schema.json';
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
 * Enforces a model's generated JSON schema before a Replicate network call.
 * Missing/invalid required fields map to the repository-standard 4xx
 * validation exception and never include provider payloads.
 */
export function assertRequiredSchemaInput(
  modelId: string,
  input: Record<string, unknown>,
  reviewedSchema?: Record<string, unknown>,
): void {
  const schema = resolveModelSchema(modelId, reviewedSchema);
  const isHailuo23Fast =
    modelIdToSchemaFilename(modelId) === HAILUO_23_FAST_SCHEMA;
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
