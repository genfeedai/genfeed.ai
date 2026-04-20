/**
 * E2E Test Module
 * Provides a fully mocked AppModule for E2E tests with PrismaService.
 * CRITICAL: All external services are mocked to prevent real API calls.
 */

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
// Controller imports
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
// Service imports
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
// Service tokens for dependency injection
import { ConfigService } from '@api/config/config.service';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
// External service mock imports
import {
  createMockCacheService,
  createMockClerkClient,
  createMockClerkService,
  createMockConfigService,
  createMockCryptoService,
  createMockEventEmitter,
  createMockFileQueueService,
  createMockHttpService,
  createMockLoggerService,
  createMockRedisService,
  createMockReplicateService,
  createMockStripeService,
} from '@api-test/mocks/external-services.mocks';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Mock Guard that always allows access (bypasses auth for E2E tests)
 */
export class MockClerkGuard {
  canActivate(): boolean {
    return true;
  }
}

/**
 * Mock Roles Guard that always allows access
 */
export class MockRolesGuard {
  canActivate(): boolean {
    return true;
  }
}

/**
 * External service mock providers
 */
export const EXTERNAL_SERVICE_MOCK_PROVIDERS = [
  {
    provide: ConfigService,
    useFactory: () => createMockConfigService(),
  },
  {
    provide: LoggerService,
    useFactory: () => createMockLoggerService(),
  },
  {
    provide: CacheService,
    useFactory: () => createMockCacheService(),
  },
  {
    provide: 'ClerkClient',
    useFactory: () => createMockClerkClient(),
  },
  {
    provide: ClerkService,
    useFactory: () => createMockClerkService(),
  },
  {
    provide: ReplicateService,
    useFactory: () => createMockReplicateService(),
  },
  {
    provide: StripeService,
    useFactory: () => createMockStripeService(),
  },
  {
    provide: FileQueueService,
    useFactory: () => createMockFileQueueService(),
  },
  {
    provide: HttpService,
    useFactory: () => createMockHttpService(),
  },
  {
    provide: 'REDIS_CLIENT',
    useFactory: () => createMockRedisService(),
  },
];

/**
 * Guard override providers for E2E tests
 */
export const GUARD_OVERRIDE_PROVIDERS = [
  {
    provide: APP_GUARD,
    useClass: MockClerkGuard,
  },
];

/**
 * E2E Test Module Configuration Options
 */
export interface E2ETestModuleOptions {
  /** Additional controllers to include */
  controllers?: Type<unknown>[];
  /** Additional providers to include */
  providers?: unknown[];
  /** Custom config overrides */
  configOverrides?: Record<string, unknown>;
  /** Whether to use mock guards (default: true) */
  useMockGuards?: boolean;
}

/**
 * Test Database Helper
 * Provides utilities for managing test data in E2E tests via PrismaService.
 */
export class TestDatabaseHelper {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Clear all known tables in the test database.
   */
  async clearDatabase(): Promise<void> {
    const tableNames = [
      'organizations',
      'brands',
      'users',
      'members',
      'credentials',
      'videos',
      'posts',
      'roles',
      'ingredients',
      'assets',
      'tags',
      'activities',
      'settings',
      'organization_settings',
      'credit_balances',
      'credit_transactions',
      'links',
      'org_integrations',
    ];

    for (const table of tableNames) {
      try {
        await (
          this.prisma as unknown as Record<
            string,
            { deleteMany: () => Promise<unknown> }
          >
        )[table]?.deleteMany();
      } catch {
        // Table may not exist in this Prisma schema yet — ignore
      }
    }
  }

  /**
   * Clear a specific table
   */
  async clearCollection(tableName: string): Promise<void> {
    try {
      await (
        this.prisma as unknown as Record<
          string,
          { deleteMany: () => Promise<unknown> }
        >
      )[tableName]?.deleteMany();
    } catch {
      // Ignore missing tables
    }
  }
}

/**
 * Create a TestDatabaseHelper instance from a NestJS module
 */
export const createTestDatabaseHelper = (moduleRef: {
  get: (token: unknown) => unknown;
}): TestDatabaseHelper => {
  const prisma = moduleRef.get<PrismaService>(PrismaService);
  return new TestDatabaseHelper(prisma);
};

/**
 * E2E Test Module Factory
 * Creates a test module with mocked external services and PrismaModule.
 */
@Module({})
export class E2ETestModule {
  /**
   * Create a test module for specific controllers/services
   */
  static async forRoot(
    options: E2ETestModuleOptions = {},
  ): Promise<DynamicModule> {
    const {
      controllers = [],
      providers = [],
      configOverrides = {},
      useMockGuards = true,
    } = options;

    const guardProviders = useMockGuards ? GUARD_OVERRIDE_PROVIDERS : [];

    return {
      controllers,
      exports: [PrismaModule],
      imports: [PrismaModule],
      module: E2ETestModule,
      providers: [
        ...EXTERNAL_SERVICE_MOCK_PROVIDERS.map((provider) => {
          if (provider.provide === ConfigService) {
            return {
              ...provider,
              useFactory: () => createMockConfigService(configOverrides),
            };
          }
          return provider;
        }),
        ...guardProviders,
        ...providers,
      ],
    };
  }

  /**
   * Create a test module for Organizations E2E tests
   */
  static async forOrganizations(): Promise<DynamicModule> {
    return E2ETestModule.forRoot({
      controllers: [OrganizationsController],
      providers: [
        OrganizationsService,
        BrandsService,
        MembersService,
        TagsService,
        PostsService,
        VideosService,
        IngredientsService,
        ActivitiesService,
        SettingsService,
        UsersService,
        AssetsService,
      ],
    });
  }

  /**
   * Create a test module for Brands E2E tests
   */
  static async forBrands(): Promise<DynamicModule> {
    return E2ETestModule.forRoot({
      controllers: [BrandsController],
      providers: [
        BrandsService,
        OrganizationsService,
        MembersService,
        UsersService,
        AssetsService,
        SettingsService,
      ],
    });
  }

  /**
   * Create a test module for Integrations E2E tests
   */
  static async forIntegrations(): Promise<DynamicModule> {
    return E2ETestModule.forRoot({
      controllers: [
        OrganizationsIntegrationsController,
        InternalIntegrationsController,
      ],
      providers: [
        IntegrationsService,
        AdminApiKeyGuard,
        {
          provide: 'CryptoService',
          useFactory: () => createMockCryptoService(),
        },
        {
          provide: EventEmitter2,
          useFactory: () => createMockEventEmitter(),
        },
        {
          provide: RedisService,
          useFactory: () => createMockRedisService(),
        },
      ],
    });
  }

  /**
   * Create a minimal test module (for auth tests)
   */
  static async forAuth(): Promise<DynamicModule> {
    return E2ETestModule.forRoot({
      controllers: [],
      providers: [
        UsersService,
        OrganizationsService,
        MembersService,
        SettingsService,
      ],
    });
  }
}
