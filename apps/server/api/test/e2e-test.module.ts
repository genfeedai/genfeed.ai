/**
 * E2E Test Module
 * Provides a fully mocked AppModule for E2E tests with PrismaService.
 * CRITICAL: All external services are mocked to prevent real API calls.
 */

import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { MembersService } from '@api/collections/members/services/members.service';
// Controller imports
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
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
import { toPrismaCredentialPlatform } from '@genfeedai/enums';
// Service tokens for dependency injection
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { DynamicModule, ExecutionContext, Module, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
// Service imports
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TaskActionsService } from '@api/collections/tasks/services/task-actions.service';
import { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';

/**
 * Mock Guard that always allows access (bypasses auth for E2E tests)
 */
export class MockBetterAuthGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      params?: Record<string, string | undefined>;
      user?: {
        brandId: string;
        id: string;
        userId: string;
        organizationId: string;
        isSuperAdmin?: boolean;
      };
    }>();
    const organizationId = request.params?.organizationId;
    request.user = {
      brandId: 'e2e-test-brand',
      id: 'authProvider_e2e_test_user',
      isSuperAdmin: false,
      organizationId: organizationId ?? 'e2e-test-organization',
      userId: 'e2e-test-user',
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
const inertCollectionService = {
  find: () => Promise.resolve([]),
  findAll: () => Promise.resolve({ docs: [] }),
  findOne: () => Promise.resolve(null),
};

/**
 * BrandsController constructor collaborators that are not the BrandsService
 * itself. CRUD E2E only needs Nest to construct the controller.
 */
export const BRAND_CONTROLLER_E2E_MOCK_PROVIDERS = [
  { provide: ActivitiesService, useValue: inertCollectionService },
  { provide: VideosService, useValue: inertCollectionService },
  { provide: ImagesService, useValue: inertCollectionService },
  { provide: ArticlesService, useValue: inertCollectionService },
  { provide: MusicsService, useValue: inertCollectionService },
  { provide: CredentialsService, useValue: inertCollectionService },
  { provide: LinksService, useValue: inertCollectionService },
  { provide: PostsService, useValue: inertCollectionService },
  { provide: AnalyticsAggregationService, useValue: inertCollectionService },
  {
    provide: BrandSetupService,
    useValue: {
      addReferenceImages: () => Promise.resolve(null),
      setupBrand: () => Promise.resolve(null),
      updateBrandNameById: () => Promise.resolve(null),
    },
  },
  {
    provide: BrandScraperService,
    useValue: { scrapeWebsite: () => Promise.resolve(null) },
  },
];

/**
 * TasksController / TasksService constructor collaborators that are not the
 * persistence layer. GET list/detail E2E does not exercise routing or planning.
 */
export const TASK_E2E_MOCK_PROVIDERS = [
  {
    provide: TaskCountersService,
    useValue: { getNextNumber: () => Promise.resolve(1) },
  },
  {
    provide: AgentOrchestratorService,
    useValue: {
      enqueue: () => Promise.resolve(null),
      run: () => Promise.resolve(null),
    },
  },
  {
    provide: TaskRoutingService,
    useValue: {
      buildRoutingDecision: () => Promise.resolve({}),
    },
  },
  {
    provide: TaskActionsService,
    useValue: {
      broadcast: () => Promise.resolve(),
    },
  },
  {
    provide: TaskPlanningService,
    useValue: {
      plan: () => Promise.resolve(null),
    },
  },
  {
    provide: WorkspaceTaskWorkflowQueueService,
    useValue: {
      enqueue: () => Promise.resolve(),
    },
  },
];

export const BRAND_SERVICE_E2E_MOCK_PROVIDERS = [
  {
    provide: CacheInvalidationService,
    useValue: {
      invalidate: () => Promise.resolve(),
      invalidateByTags: () => Promise.resolve(0),
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
    useValue: {
      importBrandKitAssets: () => Promise.resolve(null),
      resolveBrandKitAssets: () => Promise.resolve({ references: [] }),
      resolveBrandLogoUrls: () => Promise.resolve(new Map()),
    },
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

/**
 * Side-effecting collaborators required by collection controllers and services.
 * Individual E2E modules can override any token by providing it after these
 * defaults, while CRUD suites remain hermetic as constructor graphs evolve.
 */
export const ORGANIZATION_SETTINGS_E2E_MOCK = {
  create: () => Promise.resolve(null),
  ensureForOrganization: (organizationId: string) =>
    Promise.resolve({
      enabledModelIds: [],
      id: 'e2e-organization-settings',
      isGenerateArticlesEnabled: false,
      isGenerateImagesEnabled: true,
      isGenerateMusicEnabled: true,
      isGenerateVideosEnabled: true,
      organizationId,
    }),
  findOne: () => Promise.resolve(null),
  getLatestMajorVersionModelIds: () => Promise.resolve([]),
};

export const COLLECTION_E2E_MOCK_PROVIDERS = [
  BillingAccountsService,
  {
    provide: CreditReservationService,
    useValue: {
      release: () => Promise.resolve(null),
      reserve: () => Promise.resolve(null),
      settle: () => Promise.resolve(null),
    },
  },
  {
    provide: CredentialCryptoService,
    useFactory: () => createMockCryptoService(),
  },
  {
    provide: StreaksService,
    useValue: {
      checkAndUpdate: () => Promise.resolve(),
      isQualifyingActivityKey: () => false,
    },
  },
  {
    provide: DefaultRecurringContentService,
    useValue: {
      ensureDefaultBundle: () =>
        Promise.resolve({ isConfigured: false, items: [] }),
      getStatus: () => Promise.resolve({ isConfigured: false, items: [] }),
    },
  },
  {
    provide: RolesService,
    useValue: { findOne: () => Promise.resolve(null) },
  },
  {
    provide: OrganizationSettingsService,
    useValue: ORGANIZATION_SETTINGS_E2E_MOCK,
  },
  ...[
    RequestContextCacheService,
    AccessBootstrapCacheService,
    BetterAuthIdentityCacheService,
  ].map((service) => ({
    provide: service,
    useValue: { invalidateForUser: () => Promise.resolve() },
  })),
  // Real fan-out over the three stubs above — no extra behavior to stub out.
  UserAccessCacheService,
];

type PrismaDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
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
    invitations: 'invitation',
    links: 'link',
    members: 'member',
    organizations: 'organization',
    'organization-settings': 'organizationSetting',
    organization_settings: 'organizationSetting',
    org_integrations: 'orgIntegration',
    orgintegrations: 'orgIntegration',
    posts: 'post',
    'post-groups': 'postGroup',
    postGroup: 'postGroup',
    'publish-approvals': 'publishApproval',
    publishApproval: 'publishApproval',
    'content-version-pins': 'contentVersionPin',
    contentVersionPin: 'contentVersionPin',
    roles: 'role',
    settings: 'setting',
    tags: 'tag',
    tasks: 'task',
    trainings: 'training',
    users: 'user',
  };

  private readonly clearOrder = [
    'campaignTarget',
    'outreachCampaign',
    'orgIntegration',
    'task',
    'creditTransaction',
    'creditReservation',
    'creditBalance',
    'billingAccountOrganization',
    'billingAccountMember',
    'billingAccount',
    'activity',
    'link',
    'asset',
    'publishApproval',
    'post',
    'contentVersionPin',
    'postGroup',
    'ingredient',
    'credential',
    'tag',
    'brand',
    'organizationSetting',
    'invitation',
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
      const data = await this.prepareDocument(delegateName, document);
      await this.delegate(delegateName).create({ data });
    }
  }

  async getDocumentCount(
    collectionName: string,
    where?: Record<string, unknown>,
  ): Promise<number> {
    const delegateName = this.getDelegateName(collectionName);
    if (!delegateName) {
      return 0;
    }

    return this.delegate(delegateName).count(where ? { where } : undefined);
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

  private async prepareDocument(
    delegateName: string,
    document: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = { ...document };

    if (delegateName === 'organization') {
      data.slug ??= this.slugify(String(data.label ?? data.id));
      data.userId ??= 'e2e-test-user';
      await this.ensureUser(String(data.userId));
    }

    if (delegateName === 'member') {
      data.roleId ??= 'member';
      await this.ensureRole(String(data.roleId));
    }

    if (delegateName === 'credential' && typeof data.platform === 'string') {
      const prismaPlatform = toPrismaCredentialPlatform(data.platform);
      if (prismaPlatform) {
        data.platform = prismaPlatform;
      }
    }

    return data;
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
export const createTestDatabaseHelper = (
  moduleRef: Pick<TestingModule, 'get'>,
): TestDatabaseHelper => {
  const prisma = moduleRef.get(PrismaService);
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
        ...BRAND_SERVICE_E2E_MOCK_PROVIDERS,
        ...COLLECTION_E2E_MOCK_PROVIDERS,
        ...providers,
      ],
    };
  }

  /**
   * Create a test module for Organizations E2E tests
   */
  static async forOrganizations(): Promise<DynamicModule> {
    return E2ETestModule.forRoot({
      controllers: [OrganizationsController, BrandsController],
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
        ...BRAND_CONTROLLER_E2E_MOCK_PROVIDERS,
      ],
    });
  }

  /**
   * Create a test module for Tasks E2E tests.
   * Callers may override `providers` (appended last) and `useMockGuards`.
   */
  static async forTasks(
    options: Pick<E2ETestModuleOptions, 'providers' | 'useMockGuards'> = {},
  ): Promise<DynamicModule> {
    return E2ETestModule.forRoot({
      controllers: [TasksController],
      providers: [
        TasksService,
        ...TASK_E2E_MOCK_PROVIDERS,
        ...(options.providers ?? []),
      ],
      useMockGuards: options.useMockGuards,
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
