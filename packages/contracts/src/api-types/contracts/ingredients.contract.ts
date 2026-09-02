/**
 * Ingredients API Contract
 *
 * Type-safe request/response types for the Ingredients API endpoints.
 * Types are derived from OpenAPI spec, with Zod schemas for runtime validation.
 */

import { z } from 'zod';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '../..';
import {
  entityIdArraySchema,
  entityIdSchema,
  nonNegativeIntSchema,
  optionalStringSchema,
  positiveIntSchema,
} from '../helpers/common-schemas';

// ============================================================================
// Type Definitions (manual until OpenAPI generation is run)
// ============================================================================

/**
 * Request payload for creating a new ingredient
 */
export interface CreateIngredientRequest {
  promptId?: string;
  parentId?: string;
  folderId?: string;
  sources?: string[];
  metadataId?: string;
  brandId?: string;
  organizationId?: string;
  userId?: string;
  trainingId?: string;
  category?: IngredientCategory;
  generationPrompt?: string;
  generationSeed?: number;
  modelUsed?: string;
  negativePrompt?: string;
  transformations?: TransformationCategory[];
  status?: IngredientStatus;
  order?: number;
  version?: number;
  isDefault?: boolean;
  scope?: AssetScope;
  isHighlighted?: boolean;
  tags?: string[];
  groupId?: string;
  groupIndex?: number;
  cdnUrl?: string;
  s3Key?: string;
}

/**
 * Request payload for updating an existing ingredient
 */
export interface UpdateIngredientRequest {
  promptId?: string;
  parentId?: string;
  folderId?: string;
  sources?: string[];
  metadataId?: string;
  brandId?: string;
  organizationId?: string;
  userId?: string;
  trainingId?: string;
  category?: IngredientCategory;
  generationPrompt?: string;
  generationSeed?: number;
  modelUsed?: string;
  negativePrompt?: string;
  transformations?: TransformationCategory[];
  status?: IngredientStatus;
  order?: number;
  version?: number;
  isDefault?: boolean;
  scope?: AssetScope;
  isHighlighted?: boolean;
  tags?: string[];
  groupId?: string;
  groupIndex?: number;
  cdnUrl?: string;
  s3Key?: string;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema matching CreateIngredientDto
 */
export const createIngredientSchema = z.object({
  brandId: entityIdSchema.optional(),
  category: z.nativeEnum(IngredientCategory).optional(),
  cdnUrl: optionalStringSchema,
  folderId: entityIdSchema.optional(),
  generationPrompt: optionalStringSchema,
  generationSeed: z.number().int().optional(),
  groupId: optionalStringSchema,
  groupIndex: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  isHighlighted: z.boolean().optional(),
  metadataId: entityIdSchema.optional(),
  modelUsed: optionalStringSchema,
  negativePrompt: optionalStringSchema,
  order: nonNegativeIntSchema.optional(),
  organizationId: entityIdSchema.optional(),
  parentId: entityIdSchema.optional(),
  promptId: entityIdSchema.optional(),
  scope: z.nativeEnum(AssetScope).optional(),
  s3Key: optionalStringSchema,
  sources: entityIdArraySchema().optional(),
  status: z.nativeEnum(IngredientStatus).optional(),
  tags: entityIdArraySchema().optional(),
  trainingId: entityIdSchema.optional(),
  transformations: z.array(z.nativeEnum(TransformationCategory)).optional(),
  userId: entityIdSchema.optional(),
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
