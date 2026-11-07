import { z } from 'zod';
import { ModelCategory } from '../../enums/model.enum';

/**
 * A video recipe (#9615) is data, not code: an ordered list of production
 * steps, each naming the model category it runs on and the capabilities a
 * model needs to do the step. The registry decides which model runs a step,
 * so a new catalog default takes over without a code change.
 */
export const VIDEO_RECIPE_CAPABILITY_FLAGS = [
  'hasEndFrame',
  'hasInterpolation',
  'hasNativeExtend',
  'hasResolutionOptions',
  'hasSpeech',
  'hasVideoReferences',
] as const;

export const videoRecipeCapabilityFlagSchema = z.enum(
  VIDEO_RECIPE_CAPABILITY_FLAGS,
);

const recipeIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/, 'Use lowercase kebab-case ids.');

export const videoRecipeStepSchema = z
  .object({
    id: recipeIdSchema,
    label: z.string().trim().min(1).max(60),
    category: z.nativeEnum(ModelCategory),
    /** Capability flags the model must report as true. */
    requiredFlags: z.array(videoRecipeCapabilityFlagSchema).max(6),
    /** Minimum image references the model must accept. */
    minReferences: z.number().int().min(0).max(30),
    /** Minimum video references the model must accept. */
    minVideoReferences: z.number().int().min(0).max(10),
    /** The run pauses for a person's review after this step. */
    isReviewPoint: z.boolean(),
  })
  .strict();

export const videoRecipeSchema = z
  .object({
    key: recipeIdSchema,
    version: z.number().int().min(1),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    steps: z.array(videoRecipeStepSchema).min(1).max(30),
  })
  .strict()
  .refine(
    (recipe) =>
      new Set(recipe.steps.map((step) => step.id)).size === recipe.steps.length,
    { message: 'Recipe step ids must be unique.', path: ['steps'] },
  );

export const VIDEO_RECIPE_ROUTING_SOURCES = [
  'pin',
  'brand-default',
  'organization-default',
  'registry-default',
  'registry-best',
] as const;

export const videoRecipeRoutingSourceSchema = z.enum(
  VIDEO_RECIPE_ROUTING_SOURCES,
);

export const videoRecipeStepRoutingSchema = z
  .object({
    stepId: recipeIdSchema,
    label: z.string(),
    category: z.nativeEnum(ModelCategory),
    isReviewPoint: z.boolean(),
    /** Null when no usable model meets the step's requirements. */
    modelKey: z.string().nullable(),
    modelLabel: z.string().nullable(),
    source: videoRecipeRoutingSourceSchema.nullable(),
    /** Registry rows in the category that meet the step's requirements. */
    eligibleModelCount: z.number().int().min(0),
    /** Why the step has no model; null when it has one. */
    unavailableReason: z.string().nullable(),
  })
  .strict();

export const videoRecipeRoutingSchema = z
  .object({
    recipeKey: recipeIdSchema,
    recipeVersion: z.number().int().min(1),
    label: z.string(),
    isRunnable: z.boolean(),
    steps: z.array(videoRecipeStepRoutingSchema),
  })
  .strict();

/** Per-step model pins from the caller, by step id. */
export const videoRecipeRoutingRequestSchema = z
  .object({
    pins: z
      .record(recipeIdSchema, z.string().trim().min(1).max(255))
      .optional(),
  })
  .strict();

export type VideoRecipeCapabilityFlag = z.infer<
  typeof videoRecipeCapabilityFlagSchema
>;
export type VideoRecipeStep = z.infer<typeof videoRecipeStepSchema>;
export type VideoRecipe = z.infer<typeof videoRecipeSchema>;
export type VideoRecipeRoutingSource = z.infer<
  typeof videoRecipeRoutingSourceSchema
>;
export type VideoRecipeStepRouting = z.infer<
  typeof videoRecipeStepRoutingSchema
>;
export type VideoRecipeRouting = z.infer<typeof videoRecipeRoutingSchema>;
export type VideoRecipeRoutingRequest = z.infer<
  typeof videoRecipeRoutingRequestSchema
>;
