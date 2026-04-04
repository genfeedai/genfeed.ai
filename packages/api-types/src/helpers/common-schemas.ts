/**
 * Common Zod schemas for API request validation
 *
 * These primitives are reused across contract files for consistent validation.
 */

import { z } from 'zod';

/**
 * MongoDB ObjectId validation
 * 24 character hex string
 */
export const objectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId format');

/**
 * ISO 8601 date string validation
 */
export const dateStringSchema = z
  .string()
  .datetime({ offset: true })
  .or(
    z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
        'Invalid date format',
      ),
  );

/**
 * IANA timezone string (e.g., "America/New_York", "Europe/London")
 */
export const timezoneSchema = z.string().min(1).max(64);

/**
 * Array of ObjectIds with size constraints
 */
export const objectIdArraySchema = (options?: { min?: number; max?: number }) =>
  z
    .array(objectIdSchema)
    .min(options?.min ?? 0)
    .max(options?.max ?? 100);

/**
 * Non-empty string with optional length constraints
 */
export const nonEmptyStringSchema = (options?: {
  min?: number;
  max?: number;
}) =>
  z
    .string()
    .min(options?.min ?? 1)
    .max(options?.max ?? 10000);

/**
 * Optional string that can be undefined or empty
 */
export const optionalStringSchema = z.string().optional();

/**
 * Days of week array (0=Sunday, 6=Saturday)
 */
export const daysOfWeekSchema = z.array(z.number().int().min(0).max(6)).max(7);

/**
 * Positive integer
 */
export const positiveIntSchema = z.number().int().positive();

/**
 * Non-negative integer (0 or positive)
 */
export const nonNegativeIntSchema = z.number().int().nonnegative();
