/**
 * Posts API Contract
 *
 * Type-safe request/response types for the Posts API endpoints.
 * Types are derived from OpenAPI spec, with Zod schemas for runtime validation.
 */

import type { components } from '@api-types/generated/api';
import {
  dateStringSchema,
  daysOfWeekSchema,
  nonNegativeIntSchema,
  objectIdArraySchema,
  objectIdSchema,
  optionalStringSchema,
  timezoneSchema,
} from '@api-types/helpers/common-schemas';
import { PostCategory, PostFrequency, PostStatus } from '@genfeedai/enums';
import { z } from 'zod';

// ============================================================================
// Type Aliases from OpenAPI
// ============================================================================

/**
 * Request payload for creating a new post
 * Derived from OpenAPI CreatePostDto schema
 */
export type CreatePostRequest = components['schemas']['CreatePostDto'];

/**
 * Request payload for updating an existing post
 * Derived from OpenAPI UpdatePostDto schema
 */
export type UpdatePostRequest = components['schemas']['UpdatePostDto'];

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Zod schema matching CreatePostDto
 * Use with react-hook-form's zodResolver for form validation
 */
export const createPostSchema = z.object({
  category: z.nativeEnum(PostCategory).optional(),
  credential: objectIdSchema,
  description: z.string().min(1),
  externalId: optionalStringSchema,
  externalShortcode: optionalStringSchema,
  groupId: optionalStringSchema,
  ingredients: objectIdArraySchema({ max: 35 }),
  isAnalyticsEnabled: z.boolean().optional(),
  isRepeat: z.boolean().optional(),
  isShareToFeedSelected: z.boolean().optional(),
  label: z.string().min(1),
  maxRepeats: nonNegativeIntSchema.optional(),
  order: z.number().int().optional(),
  parent: objectIdSchema.optional(),
  publicationDate: dateStringSchema.optional(),
  quoteTweetId: optionalStringSchema,
  repeatDaysOfWeek: daysOfWeekSchema.optional(),
  repeatEndDate: dateStringSchema.optional(),
  repeatFrequency: z.nativeEnum(PostFrequency).optional(),
  repeatInterval: z.number().int().positive().optional(),
  scheduledDate: dateStringSchema.optional(),
  status: z.nativeEnum(PostStatus),
  tags: objectIdArraySchema().optional(),
  timezone: timezoneSchema.optional(),
}) satisfies z.ZodType<CreatePostRequest>;

/**
 * Zod schema matching UpdatePostDto
 * All fields are optional for partial updates
 */
export const updatePostSchema = z.object({
  category: z.nativeEnum(PostCategory).optional(),
  credential: objectIdSchema.optional(),
  description: z.string().min(1).optional(),
  externalId: optionalStringSchema,
  externalShortcode: optionalStringSchema,
  groupId: optionalStringSchema,
  ingredients: objectIdArraySchema({ max: 35 }).optional(),
  isAnalyticsEnabled: z.boolean().optional(),
  isRepeat: z.boolean().optional(),
  isShareToFeedSelected: z.boolean().optional(),
  label: z.string().min(1).optional(),
  maxRepeats: nonNegativeIntSchema.optional(),
  order: z.number().int().optional(),
  parent: objectIdSchema.optional(),
  publicationDate: dateStringSchema.optional(),
  quoteTweetId: optionalStringSchema,
  repeatDaysOfWeek: daysOfWeekSchema.optional(),
  repeatEndDate: dateStringSchema.optional(),
  repeatFrequency: z.nativeEnum(PostFrequency).optional(),
  repeatInterval: z.number().int().positive().optional(),
  scheduledDate: dateStringSchema.optional(),
  status: z.nativeEnum(PostStatus).optional(),
  tags: objectIdArraySchema().optional(),
  timezone: timezoneSchema.optional(),
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
