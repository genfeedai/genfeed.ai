/**
 * E2E Test Setup
 * Global setup for E2E tests - runs before all test suites
 */
import { afterAll, beforeAll } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';

import { join } from 'node:path';
// Load test environment variables
import { config as loadEnv } from 'dotenv';

loadEnv({ path: join(process.cwd(), '.env.test') });

// Import MongoMemoryServer utilities
import { stopMongoMemoryServer } from '@api-test/e2e-test.module';

// Global setup - runs before all tests
beforeAll(async () => {
  // Any global setup can go here
});

// Global teardown - runs after all tests
afterAll(async () => {
  // Stop MongoMemoryServer after all tests complete
  await stopMongoMemoryServer();
});
