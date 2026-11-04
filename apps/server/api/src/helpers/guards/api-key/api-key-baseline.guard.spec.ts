import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { ApiKeyReadAccess } from '@api/helpers/decorators/scopes/api-key-read-access.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { MANAGED_API_KEY_SCOPES } from '@api/services/integrations/stripe/stripe.constants';
import {
  ActionOrigin,
  ApiKeyCategory,
  ApiKeyScope,
} from '@genfeedai/contracts';
import {
  API_KEY_SCOPE_PRESETS,
  MCP_CLAUDE_SCOPE_CEILING,
} from '@genfeedai/contracts/constants';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

class UndecoratedController {
  route(): void {}

  @ApiKeyReadAccess()
  readAccessRoute(): void {}

  @RequiredScopes(ApiKeyScope.VIDEOS_CREATE)
  videosCreateRoute(): void {}
}

@RequiredScopes(ApiKeyScope.BRANDS_WRITE)
class BrandsWriteController {
  route(): void {}

  @RequiredScopes(ApiKeyScope.BRANDS_READ)
  brandsReadRoute(): void {}
}

type Handler = (...args: never[]) => unknown;
type ControllerClass = abstract new (...args: never[]) => unknown;

const READ = [...API_KEY_SCOPE_PRESETS.read];
const CONTENT = [...API_KEY_SCOPE_PRESETS.content];
const MCP = [...API_KEY_SCOPE_PRESETS.mcp];
const FULL = [...API_KEY_SCOPE_PRESETS.full];
const CLAUDE = [...MCP_CLAUDE_SCOPE_CEILING];
const MANAGED = [...MANAGED_API_KEY_SCOPES];
const ADMIN = [ApiKeyScope.ADMIN];
const ANALYTICS_ONLY = [ApiKeyScope.ANALYTICS_READ];
const DRAFT_ONLY = [ApiKeyScope.POSTS_DRAFT];
const INFERENCE_ONLY = [ApiKeyScope.MANAGED_INFERENCE_EXECUTE];
const NO_SCOPES: string[] = [];

const undecorated = UndecoratedController.prototype.route;
const readAccess = UndecoratedController.prototype.readAccessRoute;
const videosCreate = UndecoratedController.prototype.videosCreateRoute;
const classScoped = BrandsWriteController.prototype.route;
const handlerOverride = BrandsWriteController.prototype.brandsReadRoute;
const credentialsPatch = CredentialsController.prototype.update;
const credentialsDelete = CredentialsController.prototype.remove;

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

function routeContext(
  method: string,
  controller: ControllerClass,
  handler: Handler,
): ExecutionContext {
  const request = {
    connection: { remoteAddress: '203.0.113.7' },
    headers: { authorization: 'Bearer gf_test_key' },
    ip: '203.0.113.7',
    method,
    user: null,
  };

  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyAuthGuard deny-by-default baseline', () => {
  it.each([
    ['read preset', READ, 'GET', UndecoratedController, undecorated],
    ['read preset', READ, 'HEAD', UndecoratedController, undecorated],
    ['read preset', READ, 'POST', UndecoratedController, readAccess],
    [
      'analytics-only key',
      ANALYTICS_ONLY,
      'GET',
      UndecoratedController,
      undecorated,
    ],
    ['draft-only key', DRAFT_ONLY, 'GET', UndecoratedController, undecorated],
    ['draft-only key', DRAFT_ONLY, 'POST', UndecoratedController, undecorated],
    ['content preset', CONTENT, 'POST', UndecoratedController, undecorated],
    ['content preset', CONTENT, 'POST', UndecoratedController, videosCreate],
    ['mcp preset', MCP, 'GET', UndecoratedController, undecorated],
    ['mcp preset', MCP, 'PATCH', UndecoratedController, undecorated],
    ['mcp preset', MCP, 'DELETE', UndecoratedController, undecorated],
    ['claude MCP ceiling', CLAUDE, 'GET', UndecoratedController, undecorated],
    ['claude MCP ceiling', CLAUDE, 'POST', UndecoratedController, undecorated],
    ['full preset', FULL, 'DELETE', UndecoratedController, undecorated],
    ['managed credits key', MANAGED, 'PUT', UndecoratedController, undecorated],
    ['admin key', ADMIN, 'GET', UndecoratedController, undecorated],
    ['admin key', ADMIN, 'DELETE', UndecoratedController, undecorated],
    [
      'brands:read key',
      [ApiKeyScope.BRANDS_READ],
      'GET',
      BrandsWriteController,
      handlerOverride,
    ],
    [
      'brands:write key',
      [ApiKeyScope.BRANDS_WRITE],
      'PATCH',
      BrandsWriteController,
      classScoped,
    ],
    ['full preset', FULL, 'PATCH', CredentialsController, credentialsPatch],
    ['full preset', FULL, 'DELETE', CredentialsController, credentialsDelete],
    ['admin key', ADMIN, 'DELETE', CredentialsController, credentialsDelete],
  ])(
    'allows a %s on %s %#',
    async (_label, scopes, method, controller, handler) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(method, controller, handler)),
      ).resolves.toBe(true);
    },
  );

  it.each([
    ['read preset', READ, 'POST', UndecoratedController, undecorated],
    ['read preset', READ, 'PATCH', UndecoratedController, undecorated],
    ['read preset', READ, 'PUT', UndecoratedController, undecorated],
    ['read preset', READ, 'DELETE', UndecoratedController, undecorated],
    ['read preset', READ, 'POST', UndecoratedController, videosCreate],
    [
      'analytics-only key',
      ANALYTICS_ONLY,
      'DELETE',
      UndecoratedController,
      undecorated,
    ],
    [
      'key without scopes',
      NO_SCOPES,
      'GET',
      UndecoratedController,
      undecorated,
    ],
    [
      'key without scopes',
      NO_SCOPES,
      'POST',
      UndecoratedController,
      readAccess,
    ],
    [
      'managed-inference-only key',
      INFERENCE_ONLY,
      'GET',
      UndecoratedController,
      undecorated,
    ],
    [
      'managed-inference-only key',
      INFERENCE_ONLY,
      'POST',
      UndecoratedController,
      undecorated,
    ],
    ['read preset', READ, 'PATCH', BrandsWriteController, classScoped],
    ['mcp preset', MCP, 'PATCH', BrandsWriteController, classScoped],
    ['read preset', READ, 'PATCH', CredentialsController, credentialsPatch],
    ['read preset', READ, 'DELETE', CredentialsController, credentialsDelete],
    [
      'content preset',
      CONTENT,
      'DELETE',
      CredentialsController,
      credentialsDelete,
    ],
    ['mcp preset', MCP, 'DELETE', CredentialsController, credentialsDelete],
    [
      'managed credits key',
      MANAGED,
      'DELETE',
      CredentialsController,
      credentialsDelete,
    ],
  ])(
    'denies a %s on %s %#',
    async (_label, scopes, method, controller, handler) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(method, controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    },
  );

  it('denies a read-preset key disconnecting a social credential', async () => {
    const guard = buildGuard(keyWithScopes(READ));

    await expect(
      guard.canActivate(
        routeContext('DELETE', CredentialsController, credentialsDelete),
      ),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });
});
