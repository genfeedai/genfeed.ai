import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMockExecutionContext } from '@test/mocks/controller.mocks';

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

function imageGenerationContext() {
  const context = createMockExecutionContext({
    request: {
      connection: { remoteAddress: '203.0.113.7' },
      headers: { authorization: 'Bearer gf_test_key' },
      ip: '203.0.113.7',
      user: null,
    },
  });
  context.getHandler = () => ImagesOperationsController.prototype.create;
  return context;
}

describe('POST /images API key scope', () => {
  it('refuses a key that cannot create images', async () => {
    const guard = buildGuard(keyWithScopes(['brands:read', 'images:read']));

    await expect(guard.canActivate(imageGenerationContext())).rejects.toThrow(
      new UnauthorizedException('Insufficient permissions'),
    );
  });

  it('allows a key with images:create', async () => {
    const guard = buildGuard(keyWithScopes(['images:create']));

    await expect(guard.canActivate(imageGenerationContext())).resolves.toBe(
      true,
    );
  });
});
