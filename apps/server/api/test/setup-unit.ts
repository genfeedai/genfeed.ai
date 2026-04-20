/**
 * Unit Test Setup - runs before all unit tests
 *
 * This setup is lighter than E2E setup - no MongoDB Memory Server needed
 * since unit tests should mock all database operations.
 */
import 'reflect-metadata';
import { vi } from 'vitest';

// Mock @genfeedai/prisma so unit tests never need the generated Prisma client
vi.mock('@genfeedai/prisma', () => {
  class PrismaClient {
    $connect = vi.fn().mockResolvedValue(undefined);
    $disconnect = vi.fn().mockResolvedValue(undefined);
    $queryRaw = vi.fn().mockResolvedValue([]);
    $executeRaw = vi.fn().mockResolvedValue(0);
    $transaction = vi
      .fn()
      .mockImplementation((arg) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(new PrismaClient()),
      );
  }
  return { PrismaClient };
});

// Mock @prisma/adapter-pg so PrismaService constructor doesn't require DATABASE_URL
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn().mockImplementation(() => ({})),
}));

// Set test environment
process.env.NODE_ENV = 'test';

// =============================================================================
// CRITICAL: Block all real HTTP requests to prevent accidental API costs
// =============================================================================
vi.mock('axios', () => ({
  create: vi.fn(() => ({
    delete: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    get: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    patch: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    post: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    put: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
  })),
  default: {
    create: vi.fn(() => ({
      delete: vi
        .fn()
        .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
      get: vi
        .fn()
        .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      patch: vi
        .fn()
        .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
      post: vi
        .fn()
        .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
      put: vi
        .fn()
        .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    })),
    delete: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    get: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    patch: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    post: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
    put: vi
      .fn()
      .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
  },
  delete: vi
    .fn()
    .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
  get: vi
    .fn()
    .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
  isAxiosError: vi.fn().mockReturnValue(false),
  patch: vi
    .fn()
    .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
  post: vi
    .fn()
    .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
  put: vi
    .fn()
    .mockRejectedValue(new Error('Real HTTP calls are blocked in tests')),
}));

// Block native fetch as well
global.fetch = vi
  .fn()
  .mockRejectedValue(new Error('Real HTTP calls are blocked in tests'));

// Mock Redis URL (tests should mock Redis operations)
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock PostgreSQL URL (Prisma adapter — real connections never happen in unit tests)
process.env.DATABASE_URL = 'test-mock-database-url';

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

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});
