/**
 * Ingredients API Contract
 *
 * Type-safe request/response types for the Ingredients API endpoints.
 * Types are derived from OpenAPI spec, with Zod schemas for runtime validation.
 */

import {
  nonNegativeIntSchema,
  objectIdArraySchema,
  objectIdSchema,
  optionalStringSchema,
  positiveIntSchema,
} from '@api-types/helpers/common-schemas';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { z } from 'zod';

// ============================================================================
// Type Definitions (manual until OpenAPI generation is run)
// ============================================================================

/**
 * Request payload for creating a new ingredient
 */
export interface CreateIngredientRequest {
  prompt?: string;
  parent?: string;
  folder?: string;
  sources?: string[];
  metadata?: string;
  brand?: string;
  training?: string;
  references?: string[];
  category?: IngredientCategory;
  text?: string;
  transformations?: TransformationCategory[];
  status?: IngredientStatus;
  order?: number;
  version?: number;
  isDefault?: boolean;
  scope?: AssetScope;
  isHighlighted?: boolean;
  seed?: number;
  tags?: string[];
  groupId?: string;
  groupIndex?: number;
}

/**
 * Request payload for updating an existing ingredient
 */
export interface UpdateIngredientRequest {
  prompt?: string;
  parent?: string;
  folder?: string;
  sources?: string[];
  metadata?: string;
  brand?: string;
  training?: string;
  references?: string[];
  category?: IngredientCategory;
  text?: string;
  transformations?: TransformationCategory[];
  status?: IngredientStatus;
  order?: number;
  version?: number;
  isDefault?: boolean;
  scope?: AssetScope;
  isHighlighted?: boolean;
  seed?: number;
  tags?: string[];
  groupId?: string;
  groupIndex?: number;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema matching CreateIngredientDto
 */
export const createIngredientSchema = z.object({
  brand: objectIdSchema.optional(),
  category: z.nativeEnum(IngredientCategory).optional(),
  folder: objectIdSchema.optional(),
  groupId: optionalStringSchema,
  groupIndex: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  isHighlighted: z.boolean().optional(),
  metadata: objectIdSchema.optional(),
  order: nonNegativeIntSchema.optional(),
  parent: objectIdSchema.optional(),
  prompt: objectIdSchema.optional(),
  references: objectIdArraySchema().optional(),
  scope: z.nativeEnum(AssetScope).optional(),
  seed: z.number().int().optional(),
  sources: objectIdArraySchema().optional(),
  status: z.nativeEnum(IngredientStatus).optional(),
  tags: objectIdArraySchema().optional(),
  text: optionalStringSchema,
  training: objectIdSchema.optional(),
  transformations: z.array(z.nativeEnum(TransformationCategory)).optional(),
  version: positiveIntSchema.optional(),
}) satisfies z.ZodType<CreateIngredientRequest>;

/**
 * Zod schema matching UpdateIngredientDto
 */
export const updateIngredientSchema = createIngredientSchema;

// ============================================================================
// Inferred Types from Zod Schemas
// ============================================================================

export type CreateIngredientFormData = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientFormData = z.infer<typeof updateIngredientSchema>;
