/**
 * E2E Test Module
 * Provides a fully mocked AppModule for E2E tests with PrismaService.
 * CRITICAL: All external services are mocked to prevent real API calls.
 */

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
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
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
// External service mock imports
import {
  createMockCacheService,
  createMockConfigService,
  createMockCryptoService,
  createMockEventEmitter,
  createMockFileQueueService,
  createMockFilesClientService,
  createMockHttpService,
  createMockLoggerService,
  createMockRedisService,
  createMockReplicateService,
  createMockStripeService,
} from '@api-test/mocks/external-services.mocks';
// Service tokens for dependency injection
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { DynamicModule, ExecutionContext, Module, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

/**
 * Mock Guard that always allows access (bypasses auth for E2E tests)
 */
export class MockBetterAuthGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      params?: Record<string, string | undefined>;
      user?: {
        id: string;
        publicMetadata: {
          organization?: string;
          user?: string;
        };
      };
    }>();
    const organizationId = request.params?.['organizationId'];
    request.user = {
      id: 'authProvider_e2e_test_user',
      publicMetadata: {
        organization: organizationId,
        user: 'e2e-test-user',
      },
    };
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
    provide: ReplicateService,
    useFactory: () => createMockReplicateService(),
  },
  {
    provide: StripeService,
    useFactory: () => createMockStripeService(),
  },
  {
    provide: FilesClientService,
    useFactory: () => createMockFilesClientService(),
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
    useClass: MockBetterAuthGuard,
  },
];

/**
 * Collaborators used only by optional brand operations. CRUD-oriented E2E
 * modules provide inert tokens so Nest can construct BrandsService without
 * pulling provider-backed generation, crawling, file, or relocation paths into
 * the hermetic test boundary.
 */
export const BRAND_SERVICE_E2E_MOCK_PROVIDERS = [
  {
    provide: CacheInvalidationService,
    useValue: {
      invalidate: () => Promise.resolve(),
      invalidateByTags: () => Promise.resolve(0),
      invalidatePattern: () => Promise.resolve(),
    },
  },
  {
    provide: BrandRelocationService,
    useValue: {
      previewRelocation: () => Promise.resolve(null),
      relocateToOrganization: () => Promise.resolve(null),
    },
  },
  {
    provide: BrandGenerationService,
    useValue: {
      generateBrandVoice: () => Promise.resolve(null),
      generateFastlaneIdeas: () => Promise.resolve([]),
    },
  },
  {
    provide: BrandKitAssetsService,
    useValue: { importBrandKitAssets: () => Promise.resolve(null) },
  },
  {
    provide: BrandKitDraftService,
    useValue: {
      applyBrandKitDraft: () => Promise.resolve(null),
      buildManualBrandKitDraft: () => Promise.resolve(null),
      crawlWebsiteBrandKitDraft: () => Promise.resolve(null),
    },
  },
];

type PrismaDelegate = {
  count: () => Promise<number>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  deleteMany: () => Promise<unknown>;
  upsert?: (args: {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    where: Record<string, unknown>;
  }) => Promise<unknown>;
};

/**
 * E2E Test Module Configuration Options
 */
export interface E2ETestModuleOptions {
  /** Additional controllers to include */
  controllers?: Type<unknown>[];
  /** Additional providers to include */
  providers?: unknown[];
  /** Legacy Mongoose-era schema registrations. Prisma e2e ignores these. */
  schemas?: unknown[];
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

  private readonly collectionToDelegate: Record<string, string> = {
    activities: 'activity',
    assets: 'asset',
    brands: 'brand',
    credentials: 'credential',
    'credit-balances': 'creditBalance',
    credit_balances: 'creditBalance',
    'credit-transactions': 'creditTransaction',
    credit_transactions: 'creditTransaction',
    ingredients: 'ingredient',
    links: 'link',
    members: 'member',
    organizations: 'organization',
    'organization-settings': 'organizationSetting',
    organization_settings: 'organizationSetting',
    org_integrations: 'orgIntegration',
    orgintegrations: 'orgIntegration',
    posts: 'post',
    roles: 'role',
    settings: 'setting',
    tags: 'tag',
    tasks: 'task',
    trainings: 'training',
    users: 'user',
  };

  private readonly clearOrder = [
    'orgIntegration',
    'task',
    'creditTransaction',
    'creditBalance',
    'activity',
    'link',
    'asset',
    'post',
    'ingredient',
    'credential',
    'tag',
    'brand',
    'organizationSetting',
    'member',
    'organization',
    'setting',
    'user',
    'role',
  ];

  /**
   * Clear all known tables in the test database.
   */
  async clearDatabase(): Promise<void> {
    for (const delegateName of this.clearOrder) {
      await this.deleteFromDelegate(delegateName);
    }
  }

  /**
   * Clear a specific table
   */
  async clearCollection(tableName: string): Promise<void> {
    const delegateName = this.getDelegateName(tableName);
    if (delegateName) {
      await this.deleteFromDelegate(delegateName);
    }
  }

  async seedCollection<T extends Record<string, unknown>>(
    collectionName: string,
    documents: T[],
  ): Promise<void> {
    const delegateName = this.getDelegateName(collectionName);
    if (!delegateName) {
      return;
    }

    for (const document of documents) {
      const data = await this.normalizeDocument(delegateName, document);
      await this.delegate(delegateName).create({ data });
    }
  }

  async getDocumentCount(collectionName: string): Promise<number> {
    const delegateName = this.getDelegateName(collectionName);
    if (!delegateName) {
      return 0;
    }

    return this.delegate(delegateName).count();
  }

  private async deleteFromDelegate(delegateName: string): Promise<void> {
    try {
      await this.delegate(delegateName).deleteMany();
    } catch {
      // Ignore missing tables or FK-protected cleanup in non-targeted e2e specs.
    }
  }

  private getDelegateName(collectionName: string): string | undefined {
    return this.collectionToDelegate[collectionName] ?? collectionName;
  }

  private delegate(delegateName: string): PrismaDelegate {
    return (this.prisma as unknown as Record<string, PrismaDelegate>)[
      delegateName
    ];
  }

  private async normalizeDocument(
    delegateName: string,
    document: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = { ...document };

    this.rename(data, '_id', 'id');
    this.rename(data, 'organization', 'organizationId');
    this.rename(data, 'user', 'userId');
    this.rename(data, 'brand', 'brandId');
    this.rename(data, 'credential', 'credentialId');

    if (delegateName === 'user') {
      // Removed during the Prisma identity migration. Some legacy E2E fixtures
      // still pass this Mongo-era field, so strip it at the shared seed boundary
      // instead of letting Prisma reject every suite during beforeEach.
      delete data.isActive;
    }

    if (delegateName === 'organization') {
      data['slug'] ??= this.slugify(String(data['label'] ?? data['id']));
      data['userId'] ??= 'e2e-test-user';
      data['category'] = this.upper(data['category'] ?? 'BUSINESS');
      await this.ensureUser(String(data['userId']));
    }

    if (delegateName === 'orgIntegration') {
      data['platform'] = this.upper(data['platform']);
      data['status'] = this.upper(data['status'] ?? 'ACTIVE');
    }

    if (delegateName === 'member') {
      data['roleId'] ??= this.lower(data['role'] ?? 'member');
      delete data['role'];
      await this.ensureRole(String(data['roleId']));
    }

    if (delegateName === 'brand') {
      data['slug'] ??= this.slugify(String(data['label'] ?? data['id']));
      data['scope'] = this.upper(data['scope'] ?? 'USER');
      data['fontFamily'] = this.upper(data['fontFamily'] ?? 'MONTSERRAT_BLACK');
      data['isSelected'] ??= false;
    }

    if (delegateName === 'organizationSetting') {
      this.rename(data, 'enabledModels', 'enabledModelIds');
      delete data['isDeleted'];
      delete data['isNotificationsTelegramEnabled'];
    }

    if (delegateName === 'creditBalance') {
      data['balance'] = Number(data['balance'] ?? 0);
    }

    return data;
  }

  private rename(
    data: Record<string, unknown>,
    from: string,
    to: string,
  ): void {
    if (data[from] !== undefined && data[to] === undefined) {
      data[to] = data[from];
    }
    delete data[from];
  }

  private upper(value: unknown): string {
    return String(value).toUpperCase();
  }

  private lower(value: unknown): string {
    return String(value).toLowerCase();
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }

  private async ensureUser(userId: string): Promise<void> {
    await this.delegate('user').upsert?.({
      create: {
        email: `${userId}@example.com`,
        handle: userId,
        id: userId,
      },
      update: {},
      where: { id: userId },
    });
  }

  private async ensureRole(roleId: string): Promise<void> {
    await this.delegate('role').upsert?.({
      create: {
        id: roleId,
        key: roleId,
        label: roleId,
      },
      update: {},
      where: { id: roleId },
    });
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
      exports: [PrismaService],
      imports: [],
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
        PrismaService,
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
        ...BRAND_SERVICE_E2E_MOCK_PROVIDERS,
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
        ...BRAND_SERVICE_E2E_MOCK_PROVIDERS,
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
          provide: CredentialCryptoService,
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
