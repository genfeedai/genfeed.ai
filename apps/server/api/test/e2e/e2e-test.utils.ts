/**
 * E2E Test Utilities
 * Common utilities and helpers for E2E tests
 */

import {
  createTestDatabaseHelper,
  E2ETestModule,
  E2ETestModuleOptions,
  TestDatabaseHelper,
} from '@api-test/e2e-test.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import request from 'supertest';

/**
 * Test user context for authenticated requests
 */
export interface TestUserContext {
  clerkUserId: string;
  userId: string;
  organizationId: string;
  email: string;
  isOwner: boolean;
  isSuperAdmin: boolean;
}

/**
 * Create a default test user context
 */
export const createTestUserContext = (
  overrides: Partial<TestUserContext> = {},
): TestUserContext => ({
  clerkUserId: `clerk_${generateIdString()}`,
  email: 'test@example.com',
  isOwner: true,
  isSuperAdmin: false,
  organizationId: generateIdString(),
  userId: generateIdString(),
  ...overrides,
});

/**
 * E2E Test Application Instance
 * Wraps NestJS app with test utilities
 */
export class E2ETestApp {
  private app: INestApplication;
  private moduleRef: TestingModule;
  private dbHelper: TestDatabaseHelper;
  private userContext: TestUserContext;

  constructor(
    app: INestApplication,
    moduleRef: TestingModule,
    userContext?: TestUserContext,
  ) {
    this.app = app;
    this.moduleRef = moduleRef;
    this.dbHelper = createTestDatabaseHelper(moduleRef);
    this.userContext = userContext || createTestUserContext();
  }

  /**
   * Get the HTTP server for supertest
   */
  getHttpServer() {
    return this.app.getHttpServer();
  }

  /**
   * Get the NestJS module reference
   */
  getModuleRef() {
    return this.moduleRef;
  }

  /**
   * Get the database helper
   */
  getDbHelper() {
    return this.dbHelper;
  }

  /**
   * Get the current user context
   */
  getUserContext() {
    return this.userContext;
  }

  /**
   * Set the user context for authenticated requests
   */
  setUserContext(context: Partial<TestUserContext>) {
    this.userContext = { ...this.userContext, ...context };
  }

  /**
   * Make a GET request with authentication headers
   */
  get(url: string) {
    return this.withAuth(request(this.getHttpServer()).get(url));
  }

  /**
   * Make a POST request with authentication headers
   */
  post(url: string) {
    return this.withAuth(request(this.getHttpServer()).post(url));
  }

  /**
   * Make a PATCH request with authentication headers
   */
  patch(url: string) {
    return this.withAuth(request(this.getHttpServer()).patch(url));
  }

  /**
   * Make a PUT request with authentication headers
   */
  put(url: string) {
    return this.withAuth(request(this.getHttpServer()).put(url));
  }

  /**
   * Make a DELETE request with authentication headers
   */
  delete(url: string) {
    return this.withAuth(request(this.getHttpServer()).delete(url));
  }

  /**
   * Make an unauthenticated request
   */
  unauthenticated() {
    return request(this.getHttpServer());
  }

  /**
   * Add authentication headers to a request
   */
  private withAuth(req: request.Test): request.Test {
    return req
      .set('Authorization', `Bearer mock-jwt-token`)
      .set('x-clerk-user-id', this.userContext.clerkUserId)
      .set('x-user-id', this.userContext.userId)
      .set('x-organization-id', this.userContext.organizationId);
  }

  /**
   * Clear all data from the database
   */
  async clearDatabase() {
    await this.dbHelper.clearDatabase();
  }

  /**
   * Clear a specific collection
   */
  async clearCollection(collectionName: string) {
    await this.dbHelper.clearCollection(collectionName);
  }

  /**
   * Seed data into a collection
   */
  async seedCollection<T>(collectionName: string, documents: T[]) {
    await this.dbHelper.seedCollection(collectionName, documents);
  }

  /**
   * Close the application
   */
  async close() {
    await this.app.close();
  }
}

/**
 * Create an E2E test application
 */
export const createE2ETestApp = async (
  options: E2ETestModuleOptions = {},
  userContext?: TestUserContext,
): Promise<E2ETestApp> => {
  const moduleConfig = await E2ETestModule.forRoot(options);

  const moduleRef = await Test.createTestingModule({
    imports: [moduleConfig],
  }).compile();

  const app = moduleRef.createNestApplication();

  // Configure validation pipe (same as production)
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  // Set global prefix
  app.setGlobalPrefix('v1');

  await app.init();

  return new E2ETestApp(app, moduleRef, userContext);
};

/**
 * Create test organization data
 */
export const createTestOrganization = (
  overrides: Record<string, unknown> = {},
) => ({
  _id: generateIdString(),
  category: 'business',
  createdAt: new Date(),
  isDeleted: false,
  isSelected: true,
  label: 'Test Organization',
  updatedAt: new Date(),
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test brand data
 */
export const createTestBrand = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  backgroundColor: 'transparent',
  createdAt: new Date(),
  description: 'Test brand description',
  fontFamily: 'MONTSERRAT_BLACK',
  isActive: true,
  isDeleted: false,
  isHighlighted: false,
  isSelected: false,
  label: 'Test Brand',
  organization: generateIdString(),
  primaryColor: '#000000',
  scope: 'USER',
  secondaryColor: '#FFFFFF',
  slug: `brand-${Date.now()}`,
  updatedAt: new Date(),
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test user data
 */
export const createTestUser = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  clerkId: `clerk_${generateIdString()}`,
  createdAt: new Date(),
  email: `test-${Date.now()}@example.com`,
  firstName: 'Test',
  handle: `user-${Date.now()}`,
  isActive: true,
  isDeleted: false,
  lastName: 'User',
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create test member data
 */
export const createTestMember = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  createdAt: new Date(),
  isActive: true,
  isDeleted: false,
  organization: generateIdString(),
  role: 'member',
  updatedAt: new Date(),
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test credential data
 */
export const createTestCredential = (
  overrides: Record<string, unknown> = {},
) => ({
  _id: generateIdString(),
  accessToken: 'mock-access-token',
  brand: generateIdString(),
  createdAt: new Date(),
  externalHandle: '@testchannel',
  externalId: `ext-${Date.now()}`,
  isConnected: true,
  isDeleted: false,
  organization: generateIdString(),
  platform: 'youtube',
  refreshToken: 'mock-refresh-token',
  tokenExpiry: new Date(Date.now() + 3600000),
  updatedAt: new Date(),
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test video data
 */
export const createTestVideo = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  brand: generateIdString(),
  createdAt: new Date(),
  description: 'Test video description',
  duration: 60,
  height: 1080,
  isDeleted: false,
  label: 'Test Video',
  organization: generateIdString(),
  status: 'draft',
  updatedAt: new Date(),
  user: generateIdString(),
  width: 1920,
  ...overrides,
});

/**
 * Create test post data
 */
export const createTestPost = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  brand: generateIdString(),
  caption: 'Test post caption',
  createdAt: new Date(),
  credential: generateIdString(),
  ingredients: [],
  isDeleted: false,
  label: 'Test Post',
  organization: generateIdString(),
  platform: 'youtube',
  status: 'draft',
  updatedAt: new Date(),
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test ingredient data
 */
export const createTestIngredient = (
  overrides: Record<string, unknown> = {},
) => ({
  _id: generateIdString(),
  brand: generateIdString(),
  category: 'video',
  createdAt: new Date(),
  description: 'Test ingredient description',
  format: 'mp4',
  isDeleted: false,
  label: 'Test Ingredient',
  organization: generateIdString(),
  status: 'ready',
  updatedAt: new Date(),
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test tag data
 */
export const createTestTag = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  color: '#FF0000',
  createdAt: new Date(),
  isDeleted: false,
  label: 'Test Tag',
  organization: generateIdString(),
  updatedAt: new Date(),
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test asset data
 */
export const createTestAsset = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  category: 'image',
  createdAt: new Date(),
  isDeleted: false,
  organization: generateIdString(),
  type: 'logo',
  updatedAt: new Date(),
  url: 'https://example.com/asset.png',
  user: generateIdString(),
  ...overrides,
});

/**
 * Create test credit data
 */
export const createTestCredit = (overrides: Record<string, unknown> = {}) => ({
  _id: generateIdString(),
  balance: 10000,
  createdAt: new Date(),
  isDeleted: false,
  organization: generateIdString(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Create test organization setting data
 */
export const createTestOrganizationSetting = (
  overrides: Record<string, unknown> = {},
) => ({
  _id: generateIdString(),
  brandsLimit: 10,
  createdAt: new Date(),
  enabledModels: [],
  isDeleted: false,
  isGenerateArticlesEnabled: true,
  isGenerateImagesEnabled: true,
  isGenerateMusicEnabled: true,
  isGenerateVideosEnabled: true,
  isNotificationsDiscordEnabled: false,
  isNotificationsEmailEnabled: true,
  isNotificationsTelegramEnabled: false,
  isVerifyIngredientEnabled: true,
  isVerifyScriptEnabled: true,
  isVerifyVideoEnabled: true,
  isVoiceControlEnabled: true,
  isWatermarkEnabled: true,
  isWebhookEnabled: false,
  isWhitelabelEnabled: false,
  organization: generateIdString(),
  quotaInstagram: 100,
  quotaTiktok: 100,
  quotaTwitter: 100,
  quotaYoutube: 100,
  seatsLimit: 5,
  timezone: 'UTC',
  updatedAt: new Date(),
  webhookEndpoint: null,
  webhookSecret: null,
  ...overrides,
});

/**
 * Create test integration data
 */
export const createTestIntegration = (
  overrides: Record<string, unknown> = {},
) => ({
  _id: generateIdString(),
  config: { allowedUserIds: [], defaultWorkflow: 'wf-test' },
  createdAt: new Date(),
  encryptedToken: 'encrypted:test-bot-token',
  isDeleted: false,
  organization: generateIdString(),
  platform: 'telegram',
  status: 'active',
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Wait for a specified number of milliseconds
 */
export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate a unique test ID string
 */
export const generateIdString = () =>
  'test-id-' + Math.random().toString(36).slice(2, 9);

/**
 * Generate a unique test ID string (alias for generateIdString)
 */
export const generateId = () => generateIdString();

/**
 * E2E Test Suite Helper
 * Provides a structured way to run E2E tests
 */
export const describeE2E = (
  name: string,
  options: E2ETestModuleOptions,
  tests: (getApp: () => E2ETestApp) => void,
) => {
  describe(name, () => {
    let testApp: E2ETestApp;

    beforeAll(async () => {
      testApp = await createE2ETestApp(options);
    });

    afterAll(async () => {
      if (testApp) {
        await testApp.close();
      }
    });

    beforeEach(async () => {
      await testApp.clearDatabase();
    });

    tests(() => testApp);
  });
};
