/**
 * HTTP-level scope check for image generation (#9129): a `gf_` key reaches
 * `POST /images` through the real global `CombinedAuthGuard` and the real
 * `ApiKeyAuthGuard`, the way production registers them as `APP_GUARD`.
 * The route's own guards are replaced by a sentinel that answers 403, so an
 * allowed key proves it got past the scope boundary without skipping them.
 */
import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => false,
}));

const KEY_SCOPES: Record<string, string[]> = {
  gf_test_create: ['images:create'],
  gf_test_read: ['images:read', 'videos:create'],
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
    organizationId: 'org-1',
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
  resolveAnyBrandId: async () => 'brand-1',
  resolveEffectiveOrganizationId: async () => 'org-1',
  resolveValidDefaultBrandId: async () => undefined,
  updateLastUsed: async () => undefined,
};

const ROUTE_GUARD_REACHED = 'route guards reached';
const routeGuardSentinel = {
  canActivate: (_context: ExecutionContext): boolean => {
    throw new ForbiddenException(ROUTE_GUARD_REACHED);
  },
};
const generateImage = vi.fn();

describe('POST /images through the global auth guard', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // Cloud mode: every request needs a credential. Stubbed per test because
    // env stubs are reset after each one, and self-host mode would let a
    // loopback request through on the local identity.
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    generateImage.mockReset();
    const module = await Test.createTestingModule({
      controllers: [ImagesOperationsController],
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
        { provide: ConfigService, useValue: {} },
        { provide: ActivityRecorderService, useValue: {} },
        { provide: FilesClientService, useValue: {} },
        { provide: ImagesService, useValue: {} },
        { provide: SharedService, useValue: {} },
        { provide: TagsService, useValue: {} },
        { provide: ImageGenerationService, useValue: { generateImage } },
        { provide: AuthorizedMediaUrlService, useValue: {} },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue(routeGuardSentinel)
      .overrideGuard(CreditsGuard)
      .useValue(routeGuardSentinel)
      .overrideGuard(ModelsGuard)
      .useValue(routeGuardSentinel)
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: CallHandler) => next.handle(),
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('answers 401 for a gf_ key without images:create, before any route guard', async () => {
    const response = await request(app.getHttpServer())
      .post('/images')
      .set('Authorization', 'Bearer gf_test_read')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Insufficient permissions');
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('lets a gf_ key with images:create past the scope check to the route guards', async () => {
    const response = await request(app.getHttpServer())
      .post('/images')
      .set('Authorization', 'Bearer gf_test_create')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(ROUTE_GUARD_REACHED);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('answers 401 for an unknown gf_ key', async () => {
    const response = await request(app.getHttpServer())
      .post('/images')
      .set('Authorization', 'Bearer gf_test_unknown')
      .send({});

    expect(response.status).toBe(401);
  });
});
