import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaDeliveryResponseInterceptor } from '@api/services/media-urls/media-delivery-response.interceptor';
import { MediaUrlsModule } from '@api/services/media-urls/media-urls.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MEDIA_DELIVERY_QUEUE } from '@genfeedai/contracts/queue';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { getQueueToken } from '@nestjs/bullmq';
import {
  Controller,
  type ExecutionContext,
  Get,
  Global,
  type INestApplication,
  Module,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
  isSelfHostedDeployment: () => false,
}));
vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => true,
}));

const organizationId = testId('org');
const userId = testId('user');
const ingredientId = testId('ingredient');
const source = {
  id: ingredientId,
  organizationId,
  userId,
  brandId: null,
  metadataId: null,
  category: 'IMAGE',
  scope: 'USER',
  isPublic: false,
  version: 1,
  generationCompletedAt: null,
  fileSize: 100,
  mimeType: 'image/png',
  s3Key: 'ingredients/images/random%2F?#.png',
};
let tier = 'free';
let publicConsent = false;
const queue = { add: vi.fn() };
const variants = new Map<string, Record<string, unknown>>();
const ingredientReads: Array<string | undefined> = [];
const prisma = {
  ingredient: {
    findMany: vi.fn(
      async (args: {
        where: { organizationId?: string; id: { in: string[] } };
      }) => {
        ingredientReads.push(getTenantContext()?.organizationId);
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'Ingredient',
          operation: 'findMany',
          tenantModelNames: new Set(['Ingredient']),
        });
        return (args.where.organizationId === organizationId ||
          (!args.where.organizationId && publicConsent)) &&
          args.where.id.in.includes(ingredientId)
          ? [{ ...source, isPublic: publicConsent }]
          : [];
      },
    ),
  },
  organization: {
    findFirst: vi.fn(async () => {
      expect(getTenantContext()?.organizationId).toBeDefined();
      return { settings: { subscriptionTier: tier } };
    }),
  },
  mediaDeliveryVariant: {
    findMany: vi.fn(async () => [...variants.values()]),
    findFirst: vi.fn(async () => variants.get(ingredientId) ?? null),
    upsert: vi.fn(async (args: { create: Record<string, unknown> }) => {
      const row = { ...args.create, id: testId('variant') };
      variants.set(ingredientId, row);
      return row;
    }),
  },
  asset: { findMany: vi.fn(async () => []) },
};
const leafAuth = {
  canActivate: vi.fn(async (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.split(' ')[1];
    if (!['free', 'paid', 'foreign', 'admin'].includes(token))
      throw new UnauthorizedException();
    req.user = {
      id: userId,
      userId,
      organizationId:
        token === 'foreign' ? testId('foreignorg') : organizationId,
      brandId: testId('brand'),
      isApiKey: token === 'free',
      isSuperAdmin: token === 'admin',
    };
    return true;
  }),
};

@Global()
@Module({
  providers: [
    {
      provide: CacheService,
      useValue: { incr: vi.fn().mockResolvedValue(1), expire: vi.fn() },
    },
  ],
  exports: [CacheService],
})
class MediaFixtureCacheModule {}

@Controller('fixture')
class MediaFixtureController {
  @Get() media() {
    return { ...source, cdnUrl: 'https://provider.test/private-original' };
  }
}

describe('media issuer production module HTTP boundary', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, MediaFixtureCacheModule, MediaUrlsModule],
      controllers: [MediaFixtureController],
      providers: [
        CombinedAuthGuard,
        Reflector,
        { provide: ApiKeyAuthGuard, useValue: leafAuth },
        { provide: BetterAuthGuard, useValue: leafAuth },
        { provide: RequestContextMiddleware, useValue: { hydrate: vi.fn() } },
        { provide: LoggerService, useValue: { warn: vi.fn(), error: vi.fn() } },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue({
        isAuthorizedMediaDeliveryEnabled: true,
        isCdnSigningEnabled: false,
        mediaUrlConfig: { cdnUrl: 'https://media.test' },
      })
      .overrideProvider(FilesClientService)
      .useValue({})
      .overrideProvider(getQueueToken(MEDIA_DELIVERY_QUEUE))
      .useValue(queue)
      .compile();
    app = module.createNestApplication();
    app.useGlobalGuards(module.get(CombinedAuthGuard));
    app.useGlobalInterceptors(
      new TenantContextInterceptor(),
      module.get(MediaDeliveryResponseInterceptor),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    tier = 'free';
    publicConsent = false;
    variants.clear();
    queue.add.mockClear();
    ingredientReads.length = 0;
  });

  it('deduplicates public preparation and recovers pending enqueue after canonical consent and never renders inside a GET', async () => {
    publicConsent = true;
    const first = await request(app.getHttpServer())
      .get(`/ingredients/${ingredientId}/public-grant`)
      .expect(200);
    expect(first.headers['x-ratelimit-limit']).toBe('120');
    expect(queue.add).toHaveBeenCalledTimes(1);
    await request(app.getHttpServer())
      .get(`/ingredients/${ingredientId}/public-grant`)
      .expect(200);
    expect(queue.add).toHaveBeenCalledTimes(2);
    const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(jobIds).size).toBe(1);
    publicConsent = false;
    await request(app.getHttpServer())
      .get(`/ingredients/${ingredientId}/public-grant`)
      .expect(404);
  });

  it('retains tenant ALS while the global response projection authorizes cached raw media', async () => {
    const response = await request(app.getHttpServer())
      .get('/fixture')
      .set('Authorization', 'Bearer free')
      .expect(200);
    expect(ingredientReads).toEqual([organizationId]);
    expect(JSON.stringify(response.body)).not.toContain('private-original');
    expect(response.body.mediaDelivery.state).toBe('PENDING');
  });

  it('requires real global authentication on the original-grant route', async () => {
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/original-grant`)
      .expect(401);
    expect(ingredientReads).toEqual([]);
  });
  it('denies free API-key and admin clean grants using the current organization entitlement', async () => {
    for (const token of ['free', 'admin']) {
      await request(app.getHttpServer())
        .post(`/ingredients/${ingredientId}/original-grant`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
    expect(ingredientReads).toEqual([organizationId, organizationId]);
  });
  it('propagates global tenant scope and rejects cross-organization identities before signing', async () => {
    tier = 'pro';
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/original-grant`)
      .set('Authorization', 'Bearer foreign')
      .expect(404);
    expect(ingredientReads).toEqual([testId('foreignorg')]);
  });
  it('fails closed when authorized original signing is unavailable', async () => {
    tier = 'pro';
    await request(app.getHttpServer())
      .post(`/ingredients/${ingredientId}/original-grant`)
      .set('Authorization', 'Bearer paid')
      .expect(503);
  });
  it('rejects attacker-selected keys and URLs in preparation DTOs', async () => {
    await request(app.getHttpServer())
      .post('/ingredients/media-previews')
      .set('Authorization', 'Bearer free')
      .send({
        ids: [ingredientId],
        storageKey: source.s3Key,
        url: 'https://attacker.test/original',
      })
      .expect(400);
  });
});
