/**
 * E2E Test Module
 * Provides a fully mocked AppModule for E2E tests with MongoMemoryServer.
 * CRITICAL: All external services are mocked to prevent real API calls.
 */

import {
  Activity,
  ActivitySchema,
} from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import {
  Asset,
  AssetSchema,
} from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import {
  Brand,
  BrandSchema,
} from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  Credential,
  CredentialSchema,
} from '@api/collections/credentials/schemas/credential.schema';
import {
  CreditBalance,
  CreditBalanceSchema,
} from '@api/collections/credits/schemas/credit-balance.schema';
import {
  CreditTransactions,
  CreditTransactionsSchema,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import {
  Ingredient,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { Link, LinkSchema } from '@api/collections/links/schemas/link.schema';
import {
  Member,
  MemberSchema,
} from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import {
  OrganizationSetting,
  OrganizationSettingSchema,
} from '@api/collections/organization-settings/schemas/organization-setting.schema';
// Controller imports
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
// Schema imports - core collections
import {
  Organization,
  OrganizationSchema,
} from '@api/collections/organizations/schemas/organization.schema';
// Service imports
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { Post, PostSchema } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { Role, RoleSchema } from '@api/collections/roles/schemas/role.schema';
import {
  Setting,
  SettingSchema,
} from '@api/collections/settings/schemas/setting.schema';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { Tag, TagSchema } from '@api/collections/tags/schemas/tag.schema';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { User, UserSchema } from '@api/collections/users/schemas/user.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import {
  Video,
  VideoSchema,
} from '@api/collections/videos/schemas/video.schema';
import { VideosService } from '@api/collections/videos/services/videos.service';
// Service tokens for dependency injection
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { InternalIntegrationsController } from '@api/endpoints/integrations/integrations.controller';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import {
  OrgIntegration,
  OrgIntegrationSchema,
} from '@api/endpoints/integrations/schemas/org-integration.schema';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
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
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Schema as MongooseSchema } from 'mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

/**
 * MongoMemoryServer instance for E2E tests
 */
let mongoServer: MongoMemoryServer;

/**
 * Get or create MongoMemoryServer instance
 */
export const getMongoMemoryServer = async (): Promise<MongoMemoryServer> => {
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'e2e-test',
      },
    });
  }
  return mongoServer;
};

/**
 * Stop MongoMemoryServer instance
 */
export const stopMongoMemoryServer = async (): Promise<void> => {
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null as unknown as MongoMemoryServer;
  }
};

/**
 * Get MongoDB URI from MongoMemoryServer
 */
export const getMongoUri = async (): Promise<string> => {
  const server = await getMongoMemoryServer();
  return server.getUri();
};

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
 * Core schema definitions for E2E tests
 */
export const E2E_SCHEMA_DEFINITIONS = [
  { name: Organization.name, schema: OrganizationSchema },
  { name: Brand.name, schema: BrandSchema },
  { name: User.name, schema: UserSchema },
  { name: Credential.name, schema: CredentialSchema },
  { name: Video.name, schema: VideoSchema },
  { name: Post.name, schema: PostSchema },
  { name: Role.name, schema: RoleSchema },
  { name: Member.name, schema: MemberSchema },
  { name: Ingredient.name, schema: IngredientSchema },
  { name: Asset.name, schema: AssetSchema },
  { name: Tag.name, schema: TagSchema },
  { name: Activity.name, schema: ActivitySchema },
  { name: Setting.name, schema: SettingSchema },
  { name: OrganizationSetting.name, schema: OrganizationSettingSchema },
  { name: CreditBalance.name, schema: CreditBalanceSchema },
  { name: CreditTransactions.name, schema: CreditTransactionsSchema },
  { name: Link.name, schema: LinkSchema },
  { name: OrgIntegration.name, schema: OrgIntegrationSchema },
];

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
  /** Additional schema definitions */
  schemas?: Array<{ name: string; schema: unknown }>;
  /** Custom config overrides */
  configOverrides?: Record<string, unknown>;
  /** Whether to use mock guards (default: true) */
  useMockGuards?: boolean;
}

const AGGREGATE_PAGINATE_PLUGIN_APPLIED = Symbol.for(
  'genfeedai.e2e.aggregate-paginate-applied',
);

function withAggregatePaginate(
  schema: unknown,
): MongooseSchema<Record<string, unknown>> {
  const mongooseSchema = schema as MongooseSchema<Record<string, unknown>> & {
    [AGGREGATE_PAGINATE_PLUGIN_APPLIED]?: boolean;
  };

  if (!mongooseSchema[AGGREGATE_PAGINATE_PLUGIN_APPLIED]) {
    mongooseSchema.plugin(mongooseAggregatePaginate);
    mongooseSchema[AGGREGATE_PAGINATE_PLUGIN_APPLIED] = true;
  }

  return mongooseSchema;
}

function configureSchemaVirtuals(
  name: string,
  schema: MongooseSchema<Record<string, unknown>>,
): MongooseSchema<Record<string, unknown>> {
  if (name === Organization.name) {
    if (!schema.virtualpath('settings')) {
      schema.virtual('settings', {
        foreignField: 'organization',
        justOne: true,
        localField: '_id',
        ref: 'OrganizationSetting',
      });
    }

    if (!schema.virtualpath('credits')) {
      schema.virtual('credits', {
        foreignField: 'organization',
        justOne: true,
        localField: '_id',
        match: { isDeleted: false },
        ref: 'CreditBalance',
      });
    }
  }

  return schema;
}

/**
 * E2E Test Module Factory
 * Creates a test module with mocked external services and in-memory MongoDB
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
      schemas = [],
      configOverrides = {},
      useMockGuards = true,
    } = options;

    const mongoUri = await getMongoUri();

    const allSchemas = [...E2E_SCHEMA_DEFINITIONS, ...schemas].map(
      ({ name, schema }) => ({
        name,
        schema: configureSchemaVirtuals(name, withAggregatePaginate(schema)),
      }),
    );

    const guardProviders = useMockGuards ? GUARD_OVERRIDE_PROVIDERS : [];

    return {
      controllers,
      exports: [MongooseModule],
      imports: [
        MongooseModule.forRoot(mongoUri, {
          dbName: 'e2e-test',
        }),
        MongooseModule.forRoot(mongoUri, {
          connectionName: DB_CONNECTIONS.AUTH,
          dbName: 'e2e-test',
        }),
        MongooseModule.forRoot(mongoUri, {
          connectionName: DB_CONNECTIONS.CLOUD,
          dbName: 'e2e-test',
        }),
        MongooseModule.forFeature(allSchemas),
        MongooseModule.forFeature(allSchemas, DB_CONNECTIONS.AUTH),
        MongooseModule.forFeature(allSchemas, DB_CONNECTIONS.CLOUD),
      ],
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

/**
 * Test Database Helper
 * Provides utilities for managing test data in E2E tests
 */
export class TestDatabaseHelper {
  constructor(private readonly connection: Connection) {}

  /**
   * Clear all collections in the database
   */
  async clearDatabase(): Promise<void> {
    const collections = this.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }

  /**
   * Clear a specific collection
   */
  async clearCollection(collectionName: string): Promise<void> {
    const collection = this.connection.collection(collectionName);
    if (collection) {
      await collection.deleteMany({});
    }
  }

  /**
   * Seed test data into a collection
   */
  async seedCollection<T>(
    collectionName: string,
    documents: T[],
  ): Promise<void> {
    const collection = this.connection.collection(collectionName);
    if (collection && documents.length > 0) {
      await collection.insertMany(documents as unknown[]);
    }
  }

  /**
   * Get document count in a collection
   */
  async getDocumentCount(collectionName: string): Promise<number> {
    const collection = this.connection.collection(collectionName);
    return collection ? await collection.countDocuments() : 0;
  }
}

/**
 * Create a TestDatabaseHelper instance from a NestJS module
 */
export const createTestDatabaseHelper = (moduleRef: {
  get: (token: unknown) => unknown;
}): TestDatabaseHelper => {
  const connection = moduleRef.get<Connection>(getConnectionToken());
  return new TestDatabaseHelper(connection);
};
