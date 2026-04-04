/**
 * Shared utilities for working with provider model schemas
 */

type SchemaProperty = {
  default?: unknown;
  enum?: unknown[];
  type?: string;
  $ref?: string;
};

type SchemaProperties = Record<string, SchemaProperty>;

interface Schema {
  properties?: SchemaProperties;
}

/**
 * Extract default values from schema properties
 */
export function getSchemaDefaults(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema) return {};

  const properties = (schema as Schema).properties;
  if (!properties) return {};

  const defaults: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.default !== undefined) {
      defaults[key] = prop.default;
    }
  }
  return defaults;
}

/**
 * Check if the model's schema supports image input
 * Used to determine whether to enable/disable image input handles
 */
export function supportsImageInput(
  schema: Record<string, unknown> | undefined,
): boolean {
  if (!schema) return true; // Default to true if no schema

  const properties = (schema as Schema).properties;
  if (!properties) return true;

  // Check for common image input field names across providers
  return !!(
    properties.image ||
    properties.image_input ||
    properties.image_url ||
    properties.image_urls ||
    properties.start_image ||
    properties.first_frame_image ||
    properties.reference_images
  );
}

/**
 * Extract enum values from component schemas for SchemaInputs dropdowns
 */
export function extractEnumValues(
  componentSchemas:
    | Record<string, { enum?: unknown[]; type?: string }>
    | undefined,
): Record<string, string[]> | undefined {
  if (!componentSchemas) return undefined;

  const result: Record<string, string[]> = {};
  for (const [key, schema] of Object.entries(componentSchemas)) {
    if (schema.enum && Array.isArray(schema.enum)) {
      // Convert all enum values to strings for the dropdown
      result[key] = schema.enum.map((v) => String(v));
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
