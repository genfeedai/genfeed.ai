import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ImageReferenceField,
  ReplicateModelSchema,
} from '@api/services/prompt-builder/interfaces/replicate-schema.interface';
import { IMAGE_REFERENCE_FIELDS } from '@api/services/prompt-builder/interfaces/replicate-schema.interface';
import { Logger } from '@nestjs/common';

const logger = new Logger('ReplicateSchemaUtil');

function resolveSchemasDir(): string | null {
  const candidates = [
    // Production artifact location (start:prod loads ../dist/apps/api/main)
    join(
      process.cwd(),
      '../dist/apps/api/services/integrations/replicate/schemas',
    ),
    // Local dev/test from api package root
    join(process.cwd(), 'src/services/integrations/replicate/schemas'),
    // Fallback when cwd differs but compiled file structure is preserved
    join(__dirname, '../../integrations/replicate/schemas'),
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
