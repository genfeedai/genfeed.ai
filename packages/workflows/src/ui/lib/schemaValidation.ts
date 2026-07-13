/**
 * Utility functions for validating required schema fields
 */

/**
 * JSON Schema with required array
 */
interface JsonSchema {
  required?: string[];
  properties?: Record<string, unknown>;
}

/**
 * Validates that all required fields in a JSON Schema have values.
 *
 * @param inputSchema - The JSON Schema with required array
 * @param values - Current field values
 * @param skipFields - Fields to skip (e.g., fields populated via connections)
 * @returns Validation result with isValid flag and list of missing fields
 */
export function validateRequiredSchemaFields(
  inputSchema: Record<string, unknown> | undefined,
  values: Record<string, unknown>,
  skipFields: Set<string>,
): { isValid: boolean; missingFields: string[] } {
  if (!inputSchema) {
    return { isValid: true, missingFields: [] };
  }

  const schema = inputSchema as JsonSchema;
  const requiredFields = schema.required ?? [];

  if (requiredFields.length === 0) {
    return { isValid: true, missingFields: [] };
  }

  const missingFields: string[] = [];

  for (const field of requiredFields) {
    // Skip fields that come from connections
    if (skipFields.has(field)) {
      continue;
    }

    const value = values[field];

    // Check if value is missing or empty
    if (value === undefined || value === null || value === '') {
      missingFields.push(field);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Fields that are populated via node connections rather than schema inputs.
 * These should be skipped when validating schema required fields.
 */
export const CONNECTION_FIELDS = new Set([
  'prompt',
  'image',
  'image_input',
  'image_url',
  'image_urls',
  'video',
  'audio',
  'start_image',
  'first_frame_image',
  'last_frame',
  'reference_images',
  'video_url',
  'end_image',
  'start_video_id',
  'end_video_id',
  'subject_reference',
  'image_prompt',
  'mask',
]);
