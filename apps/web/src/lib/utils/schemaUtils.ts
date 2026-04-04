export {
  getSchemaDefaults,
  extractEnumValues,
} from '@genfeedai/workflow-ui/lib';

/**
 * Check whether a model's input schema accepts image input.
 *
 * Overrides the upstream @genfeedai/workflow-ui version which is missing
 * `image_url` and `image_urls` — used by FAL nano-banana-2/edit and similar models.
 * Permissive default: returns true when schema is absent.
 */
export function supportsImageInput(schema: Record<string, unknown> | undefined): boolean {
  if (!schema) return true;
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return true;
  return !!(
    properties.image ||
    properties.image_input ||
    properties.image_url ||
    properties.image_urls ||
    properties.start_image ||
    properties.first_frame_image ||
    properties.reference_images ||
    properties.source_image ||
    properties.init_image
  );
}
