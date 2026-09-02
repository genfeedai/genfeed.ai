/**
 * Interfaces for Replicate model JSON Schema definitions.
 * Used by the generic prompt builder to map schema properties
 * to prompt input fields at runtime.
 */

/** A single property definition from a Replicate JSON Schema */
export interface ReplicateSchemaProperty {
  type: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  nullable?: boolean;
  format?: string;
  items?: {
    type: string;
    format?: string;
  };
  'x-order'?: number;
}

/** Top-level structure of a Replicate model's input schema */
export interface ReplicateModelSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type: string;
  required?: string[];
  properties: Record<string, ReplicateSchemaProperty>;
}

/**
 * Known field patterns in Replicate image model schemas.
 * The generic builder maps these to PromptBuilderParams.
 */
export const IMAGE_REFERENCE_FIELDS = [
  'image_input',
  'input_images',
  'input_image',
  'image',
  'reference_images',
  'image_prompt',
  'character_reference_image',
] as const;

export type ImageReferenceField = (typeof IMAGE_REFERENCE_FIELDS)[number];
