import { Types } from 'mongoose';
import { vi } from 'vitest';

/**
 * Test data generators
 */
export const generateTestId = () => new Types.ObjectId().toString();

export const generateTestEmail = (prefix = 'test') =>
  `${prefix}.${Date.now()}@example.com`;

export const generateTestUrl = (path = '') => `https://test.example.com${path}`;

/**
 * Test error scenarios
 */
export const testErrors = {
  badRequest: new Error('Bad request'),
  conflict: new Error('Conflict'),
  forbidden: new Error('Forbidden'),
  internalServer: new Error('Internal server error'),
  networkError: new Error('Network error'),
  notFound: new Error('Resource not found'),
  timeoutError: new Error('Request timeout'),
  unauthorized: new Error('Unauthorized'),
  validationError: new Error('Validation failed'),
};

/**
 * Test utilities
 */
export const waitFor = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Clean up helpers
 */
export const clearAllMocks = () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
};

/**
 * Asserts that an async function throws. Optionally validates the thrown error.
 */
export const expectToThrowAsync = async (
  fn: () => Promise<unknown>,
  expectedError?: Error,
): Promise<void> => {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Expected function to throw, but it did not'
    ) {
      throw error;
    }
    if (expectedError) {
      expect(error).toEqual(expectedError);
    }
  }
};
