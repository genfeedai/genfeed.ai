/**
 * HTTP-level brand narrowing for API keys (#9130). A `gf_` key reaches the
 * probe routes through the real global `CombinedAuthGuard` and the real
 * `ApiKeyAuthGuard`. A key limited to one brand reads that brand and gets 404
 * for a sibling brand of the same organization, wherever the request names
 * it; a key without a limit still reaches every brand.
 */

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => false,
}));

const OWN_BRAND = 'cm0ownbrand000000000000001';
const SIBLING_BRAND = 'cm0siblingbrand0000000001';
const DELETED_BRAND = 'cm0deletedbrand0000000001';
const LIVE_BRANDS: ReadonlySet<string> = new Set([OWN_BRAND, SIBLING_BRAND]);

const KEY_METADATA: Record<string, Record<string, unknown> | null> = {
  gf_test_gone: { allowedBrandIds: [DELETED_BRAND] },
  gf_test_open: null,
  gf_test_restricted: { allowedBrandIds: [OWN_BRAND] },
};

function storedKey(metadata: Record<string, unknown> | null): ApiKeyDocument {
  return {
    allowedIps: [],
    category: ApiKeyCategory.GENFEEDAI,
    defaultBrandId: null,
    expiresAt: null,
    id: 'key-1',
    isRevoked: false,
    key: 'hashed',
    metadata,
    organizationId: 'org-1',
    rateLimit: 60,
    scopes: ['brands:read', 'brands:write', 'images:read', 'images:create'],
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
    plainKey in KEY_METADATA ? storedKey(KEY_METADATA[plainKey]) : null,
  hasScope: ApiKeysService.prototype.hasScope,
  isIpAllowed: () => true,
  isMcpOAuthSession: () => false,
  readMcpAccessMode: () => 'standard',
  resolveActionOrigin: () => ActionOrigin.API,
  resolveAnyBrandId: async () => SIBLING_BRAND,
  resolveEffectiveOrganizationId: async () => 'org-1',
  resolveLiveAllowedBrandIds: async (
    _organizationId: string,
    brandIds: readonly string[],
  ) => brandIds.filter((brandId) => LIVE_BRANDS.has(brandId)),
  resolveValidDefaultBrandId: async () => undefined,
  updateLastUsed: async () => undefined,
};

@Controller()
class BrandProbeController {
  @Get('brands/:brandId')
  readBrand(@Param('brandId') brandId: string) {
    return { brandId };
  }

  @Patch('brands/:id/agent-config')
  updateBrand(@Param('id') id: string) {
    return { brandId: id };
  }

  @Get('images')
  listImages(
    @Query('brandId') brandId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      actingBrandId: user.brandId,
      allowedBrandIds: user.allowedBrandIds ?? null,
      brandId: brandId ?? null,
    };
  }

  @Post('images')
  generateImage(@Body() body: { brandId?: string }) {
    return { brandId: body.brandId ?? null };
  }
}

describe('API keys limited to some brands', () => {
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    const module = await Test.createTestingModule({
      controllers: [BrandProbeController],
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
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('reads its own brand', async () => {
    const response = await request(app.getHttpServer())
      .get(`/brands/${OWN_BRAND}`)
      .set('Authorization', 'Bearer gf_test_restricted');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ brandId: OWN_BRAND });
  });

  it.each([
    ['the brand path', 'get', `/brands/${SIBLING_BRAND}`, undefined],
    [
      'a brands/:id path',
      'patch',
      `/brands/${SIBLING_BRAND}/agent-config`,
      undefined,
    ],
    ['the query', 'get', `/images?brandId=${SIBLING_BRAND}`, undefined],
    ['the body', 'post', '/images', { brandId: SIBLING_BRAND }],
  ] as const)(
    'answers 404 for a sibling brand named in %s',
    async (_where, method, path, body) => {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', 'Bearer gf_test_restricted')
        .send(body);

      expect(response.status).toBe(404);
      expect(response.body.detail).toBe('Brand not found');
    },
  );

  it('acts on its own brand when the request names none', async () => {
    const response = await request(app.getHttpServer())
      .get('/images')
      .set('Authorization', 'Bearer gf_test_restricted');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      actingBrandId: OWN_BRAND,
      allowedBrandIds: [OWN_BRAND],
      brandId: null,
    });
  });

  it.each([
    ['its own brand', OWN_BRAND],
    ['a sibling brand', SIBLING_BRAND],
  ])('lets a key without a limit read %s', async (_label, brandId) => {
    const response = await request(app.getHttpServer())
      .get(`/brands/${brandId}`)
      .set('Authorization', 'Bearer gf_test_open');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ brandId });
  });

  it('keeps a key without a limit on the organization-wide brand fallback', async () => {
    const response = await request(app.getHttpServer())
      .get('/images')
      .set('Authorization', 'Bearer gf_test_open');

    expect(response.body).toEqual({
      actingBrandId: SIBLING_BRAND,
      allowedBrandIds: null,
      brandId: null,
    });
  });

  it('refuses a key whose every allowed brand was deleted', async () => {
    const response = await request(app.getHttpServer())
      .get('/images')
      .set('Authorization', 'Bearer gf_test_gone');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('API key has no brand left to act on');
  });
});
