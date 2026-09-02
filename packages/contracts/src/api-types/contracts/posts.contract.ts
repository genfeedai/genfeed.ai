/**
 * Posts API Contract
 *
 * Type-safe request/response types for the Posts API endpoints.
 * Types are derived from OpenAPI spec, with Zod schemas for runtime validation.
 */

import { z } from 'zod';
import {
  PostCategory,
  PostFormat,
  PostFrequency,
  PostVisibility,
  TargetExecutionState,
} from '../..';
import type { components } from '../generated/api.js';
import {
  dateStringSchema,
  daysOfWeekSchema,
  entityIdArraySchema,
  entityIdSchema,
  nonNegativeIntSchema,
  optionalStringSchema,
  timezoneSchema,
} from '../helpers/common-schemas';

// ============================================================================
// Type Aliases from OpenAPI
// ============================================================================

/**
 * Request payload for creating a new post
 * Derived from OpenAPI CreatePostDto schema
 */
export type CreatePostRequest = Omit<
  components['schemas']['CreatePostDto'],
  'status'
> & {
  format?: PostFormat;
};

/**
 * Request payload for updating an existing post
 * Derived from OpenAPI UpdatePostDto schema
 */
export type UpdatePostRequest = Omit<
  components['schemas']['UpdatePostDto'],
  'status'
> & {
  format?: PostFormat;
};

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema matching CreatePostDto
 * Use with react-hook-form's zodResolver for form validation
 */
export const createPostSchema = z.object({
  category: z.nativeEnum(PostCategory).optional(),
  credentialId: entityIdSchema,
  description: z.string().min(1),
  externalId: optionalStringSchema,
  externalShortcode: optionalStringSchema,
  format: z.nativeEnum(PostFormat).optional(),
  groupId: optionalStringSchema,
  ingredients: entityIdArraySchema({ max: 35 }),
  isAnalyticsEnabled: z.boolean().optional(),
  isRepeat: z.boolean().optional(),
  isShareToFeedSelected: z.boolean().optional(),
  label: z.string().min(1),
  maxRepeats: nonNegativeIntSchema.optional(),
  order: z.number().int().optional(),
  parentId: entityIdSchema.optional(),
  contentRunId: optionalStringSchema,
  personaId: optionalStringSchema,
  variantId: optionalStringSchema,
  hookVersion: optionalStringSchema,
  creativeVersion: optionalStringSchema,
  scheduleSlot: optionalStringSchema,
  publishIntent: optionalStringSchema,
  publicationDate: dateStringSchema.optional(),
  quoteTweetId: optionalStringSchema,
  repeatDaysOfWeek: daysOfWeekSchema.optional(),
  repeatEndDate: dateStringSchema.optional(),
  repeatFrequency: z.nativeEnum(PostFrequency).optional(),
  repeatInterval: z.number().int().positive().optional(),
  scheduledDate: dateStringSchema.optional(),
  source: optionalStringSchema,
  targetExecutionState: z.nativeEnum(TargetExecutionState).optional(),
  tags: entityIdArraySchema().optional(),
  timezone: timezoneSchema.optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
}) satisfies z.ZodType<CreatePostRequest>;

/**
 * Zod schema matching UpdatePostDto
 * All fields are optional for partial updates
 */
export const updatePostSchema = z.object({
  category: z.nativeEnum(PostCategory).optional(),
  credentialId: entityIdSchema.optional(),
  description: z.string().min(1).optional(),
  externalId: optionalStringSchema,
  externalShortcode: optionalStringSchema,
  format: z.nativeEnum(PostFormat).optional(),
  groupId: optionalStringSchema,
  ingredients: entityIdArraySchema({ max: 35 }).optional(),
  isAnalyticsEnabled: z.boolean().optional(),
  isRepeat: z.boolean().optional(),
  isShareToFeedSelected: z.boolean().optional(),
  label: z.string().min(1).optional(),
  maxRepeats: nonNegativeIntSchema.optional(),
  order: z.number().int().optional(),
  parentId: entityIdSchema.optional(),
  contentRunId: optionalStringSchema,
  personaId: optionalStringSchema,
  variantId: optionalStringSchema,
  hookVersion: optionalStringSchema,
  creativeVersion: optionalStringSchema,
  scheduleSlot: optionalStringSchema,
  publishIntent: optionalStringSchema,
  publicationDate: dateStringSchema.optional(),
  quoteTweetId: optionalStringSchema,
  repeatDaysOfWeek: daysOfWeekSchema.optional(),
  repeatEndDate: dateStringSchema.optional(),
  repeatFrequency: z.nativeEnum(PostFrequency).optional(),
  repeatInterval: z.number().int().positive().optional(),
  scheduledDate: dateStringSchema.optional(),
  targetExecutionState: z.nativeEnum(TargetExecutionState).optional(),
  tags: entityIdArraySchema().optional(),
  timezone: timezoneSchema.optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
}) satisfies z.ZodType<UpdatePostRequest>;

// ============================================================================
// Inferred Types from Zod Schemas
// ============================================================================

/**
 * Inferred type from createPostSchema
 * Use when you need the validated form data type
 */
export type CreatePostFormData = z.infer<typeof createPostSchema>;

/**
 * Inferred type from updatePostSchema
 * Use when you need the validated form data type
 */
export type UpdatePostFormData = z.infer<typeof updatePostSchema>;
