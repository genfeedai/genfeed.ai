/**
 * HTTP-level check for creating a brand with a `gf_` key (#9129). The request
 * goes through the real global `CombinedAuthGuard`, the real `ApiKeyAuthGuard`
 * and the production validation pipe into the real `BrandsController`, so the
 * result is what a caller sees: a key without `brands:write` is refused, and a
 * key with it creates the brand in its own organization, whatever organization
 * the request body names.
 */
import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CallHandler,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => false,
}));

const KEY_ORGANIZATION = 'cmorganization000000000000001';
const OTHER_ORGANIZATION = 'cmorganization000000000000002';

const KEY_SCOPES: Record<string, string[]> = {
  gf_test_read: ['brands:read'],
  gf_test_write: ['brands:read', 'brands:write'],
};

function storedKey(scopes: string[]): ApiKeyDocument {
  return {
    allowedIps: [],
    category: ApiKeyCategory.GENFEEDAI,
    defaultBrandId: null,
    expiresAt: null,
    id: 'key-1',
    isRevoked: false,
    key: 'hashed',
    metadata: null,
    organizationId: KEY_ORGANIZATION,
    rateLimit: 60,
    scopes,
    userId: 'user-1',
  } as unknown as ApiKeyDocument;
}

const apiKeysService = {
  canSwitchOrganizations: () => false,
  checkRateLimit: async () => ({
    allowed: true,
    limit: 60,
    retryAfterSeconds: 0,
  }),
  findByKey: async (plainKey: string) =>
    KEY_SCOPES[plainKey] ? storedKey(KEY_SCOPES[plainKey]) : null,
  hasScope: ApiKeysService.prototype.hasScope,
  isIpAllowed: () => true,
  isMcpOAuthSession: () => false,
  readMcpAccessMode: () => 'standard',
  resolveActionOrigin: () => ActionOrigin.API,
  resolveAnyBrandId: async () => 'cmbrand000000000000000001',
  resolveEffectiveOrganizationId: async () => KEY_ORGANIZATION,
  resolveValidDefaultBrandId: async () => undefined,
  updateLastUsed: async () => undefined,
};

const BRAND_BODY = {
  backgroundColor: '#ffffff',
  fontFamily: 'Inter',
  label: 'Partner brand',
  primaryColor: '#111111',
  secondaryColor: '#222222',
};

const noopService = { findAll: vi.fn(), findOne: vi.fn() };
const brandRows: Record<string, unknown>[] = [];

const brandsService = {
  attachBrandKitAssetRelations: async (brands: unknown[]) => brands,
  attachBrandListRelations: async (brands: unknown[]) => brands,
  brandAccessService: brandAccessFixture(),
  // The service persists what the controller hands it; the row it returns is
  // what the caller reads back.
  create: async (dto: Record<string, unknown>) => {
    const row = { id: 'cmbrand000000000000000009', isDeleted: false, ...dto };
    brandRows.push(row);
    return row;
  },
  findAll: vi.fn(),
  findOne: vi.fn(),
  supportsField: () => true,
};

describe('POST /brands with a gf_ key', () => {
  let app: INestApplication;

  beforeEach(async () => {
    brandRows.length = 0;
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    const module = await Test.createTestingModule({
      controllers: [BrandsController],
      providers: [
        { provide: ApiKeysService, useValue: apiKeysService },
        ApiKeyAuthGuard,
        {
          provide: BetterAuthGuard,
          useValue: {
            canActivate: () => {
              throw new UnauthorizedException();
            },
          },
        },
        { provide: PrismaService, useValue: {} },
        {
          provide: LoggerService,
          useValue: {
            debug: () => undefined,
            error: () => undefined,
            log: () => undefined,
            warn: () => undefined,
          },
        },
        {
          provide: RequestContextMiddleware,
          useValue: { hydrate: async () => undefined },
        },
        { provide: APP_GUARD, useClass: CombinedAuthGuard },
        { provide: BrandsService, useValue: brandsService },
        { provide: BrandRelocationJobsService, useValue: {} },
        { provide: BrandSetupService, useValue: {} },
        { provide: ActivityRecorderService, useValue: { record: vi.fn() } },
        { provide: VideosService, useValue: noopService },
        { provide: ImagesService, useValue: noopService },
        { provide: ArticlesService, useValue: noopService },
        { provide: MusicsService, useValue: noopService },
        { provide: CredentialsService, useValue: noopService },
        { provide: LinksService, useValue: noopService },
        { provide: PostsService, useValue: noopService },
        { provide: AnalyticsAggregationService, useValue: noopService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: CallHandler) => next.handle(),
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('answers 401 for a key that can only read brands, and creates nothing', async () => {
    const response = await request(app.getHttpServer())
      .post('/brands')
      .set('Authorization', 'Bearer gf_test_read')
      .send({ ...BRAND_BODY, label: 'Read only attempt' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Insufficient permissions');
    expect(brandRows).toEqual([]);
  });

  it.each([
    ['names no organization', {}],
    ['names another organization', { organizationId: OTHER_ORGANIZATION }],
    [
      'names another organization as an alias',
      { organization: OTHER_ORGANIZATION },
    ],
  ] as const)(
    'creates the brand in the key organization when the body %s',
    async (_name, extra) => {
      const response = await request(app.getHttpServer())
        .post('/brands')
        .set('Authorization', 'Bearer gf_test_write')
        .send({ ...BRAND_BODY, ...extra });

      expect(response.status).toBe(201);
      expect(brandRows).toHaveLength(1);
      expect(brandRows[0]).toMatchObject({
        label: 'Partner brand',
        organizationId: KEY_ORGANIZATION,
      });
      expect(brandRows[0]).not.toHaveProperty('organization');
    },
  );
});
