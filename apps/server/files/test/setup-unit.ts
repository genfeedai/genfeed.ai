/**
 * Unit Test Setup - runs before all unit tests
 *
 * This setup is lighter than E2E setup - no MongoDB Memory Server needed
 * since unit tests should mock all database operations.
 */
import { vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';

// Mock Redis URL (tests should mock Redis operations)
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock AWS credentials for file operations
process.env.AWS_ACCESS_KEY_ID = 'test-mock-aws-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-mock-aws-secret';
process.env.AWS_REGION = 'us-west-1';
process.env.AWS_S3_BUCKET = 'test-bucket';

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});
