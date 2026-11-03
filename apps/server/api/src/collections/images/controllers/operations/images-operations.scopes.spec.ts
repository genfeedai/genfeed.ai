import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

function keyWithScopes(scopes: string[]): ApiKeyDocument {
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

function buildGuard(apiKey: ApiKeyDocument): ApiKeyAuthGuard {
  const apiKeysService = {
    canSwitchOrganizations: () => false,
    checkRateLimit: async () => ({
      allowed: true,
      limit: 60,
      retryAfterSeconds: 0,
    }),
    findByKey: async () => apiKey,
    hasScope: ApiKeysService.prototype.hasScope,
    isIpAllowed: () => true,
    isMcpOAuthSession: () => false,
    readMcpAccessMode: () => 'standard',
    resolveActionOrigin: () => ActionOrigin.API,
    resolveAnyBrandId: async () => 'brand-1',
    resolveEffectiveOrganizationId: async () => 'org-1',
    resolveValidDefaultBrandId: async () => undefined,
    updateLastUsed: async () => undefined,
  } as unknown as ApiKeysService;

  return new ApiKeyAuthGuard(apiKeysService, new Reflector());
}

type ImageRoute = 'create' | 'edit' | 'splitContactSheet';

function imageGenerationContext(route: ImageRoute): ExecutionContext {
  const request = {
    connection: { remoteAddress: '203.0.113.7' },
    headers: { authorization: 'Bearer gf_test_key' },
    ip: '203.0.113.7',
    user: null,
  };

  return {
    getClass: () => ImagesOperationsController,
    getHandler: () => ImagesOperationsController.prototype[route],
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe.each([
  ['POST /images', 'create'],
  ['POST /images/:id/edit', 'edit'],
  ['POST /images/:id/split', 'splitContactSheet'],
] as const)('%s API key scope', (_label, route) => {
  it('refuses a key that cannot create images', async () => {
    const guard = buildGuard(keyWithScopes(['brands:read', 'images:read']));

    await expect(
      guard.canActivate(imageGenerationContext(route)),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it('allows a key with images:create', async () => {
    const guard = buildGuard(keyWithScopes(['images:create']));

    await expect(
      guard.canActivate(imageGenerationContext(route)),
    ).resolves.toBe(true);
  });
});
