/**
 * E2E Test Setup
 *
 * This file runs before all E2E tests to set up the test environment.
 * CRITICAL: Ensures all external services are mocked to prevent real API calls.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Global reference to MongoDB memory server
let mongoServer: MongoMemoryServer;

// Setup before all tests
beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URL = mongoServer.getUri();

  // Set test environment
  process.env.NODE_ENV = 'test';

  // Mock Redis URL (tests should mock Redis operations)
  process.env.REDIS_URL = 'redis://localhost:6379';

  // Mock all external service keys to prevent accidental real calls
  process.env.REPLICATE_API_TOKEN = 'test-mock-replicate-key';
  process.env.STRIPE_SECRET_KEY = 'test-mock-stripe-key';
  process.env.CLERK_SECRET_KEY = 'test-mock-clerk-key';
  process.env.ELEVENLABS_API_KEY = 'test-mock-elevenlabs-key';
  process.env.HEYGEN_API_KEY = 'test-mock-heygen-key';
  process.env.KLINGAI_ACCESS_KEY = 'test-mock-klingai-key';
  process.env.LEONARDO_API_KEY = 'test-mock-leonardo-key';

  // Mock social platform credentials
  process.env.YOUTUBE_CLIENT_ID = 'test-mock-youtube-id';
  process.env.YOUTUBE_CLIENT_SECRET = 'test-mock-youtube-secret';
  process.env.TIKTOK_CLIENT_KEY = 'test-mock-tiktok-key';
  process.env.TIKTOK_CLIENT_SECRET = 'test-mock-tiktok-secret';
  process.env.INSTAGRAM_APP_ID = 'test-mock-instagram-id';
  process.env.INSTAGRAM_APP_SECRET = 'test-mock-instagram-secret';
  process.env.TWITTER_CLIENT_ID = 'test-mock-twitter-id';
  process.env.TWITTER_CLIENT_SECRET = 'test-mock-twitter-secret';

  // Mock AWS credentials
  process.env.AWS_ACCESS_KEY_ID = 'test-mock-aws-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-mock-aws-secret';
  process.env.AWS_REGION = 'us-west-1';
  process.env.AWS_S3_BUCKET = 'test-bucket';

  // Mock encryption key
  process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-for-testing-only';
});

// Cleanup after all tests
afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});

// Console warning interceptor to catch accidental real API calls
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = args.join(' ');

  // Detect potential real API calls
  if (
    message.includes('api.openai.com') ||
    message.includes('api.replicate.com') ||
    message.includes('api.stripe.com') ||
    message.includes('api.elevenlabs.io')
  ) {
    throw new Error(
      'E2E TEST ERROR: Detected potential real API call! All external services must be mocked.',
    );
  }

  originalWarn.apply(console, args);
};
