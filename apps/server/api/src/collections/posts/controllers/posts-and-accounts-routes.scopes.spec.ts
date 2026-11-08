/**
 * Posts and Connected accounts read scopes (#9129). A key reads posts with
 * `posts:read`, and connected accounts with `credentials:read`, or with any
 * scope that drafts, schedules, approves or publishes posts. Any other read
 * scope no longer reaches them. Checked through the real `ApiKeyAuthGuard`
 * against each real route handler's metadata.
 */
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { LinkedInController } from '@api/services/integrations/linkedin/controllers/linkedin.controller';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

type Handler = (...args: never[]) => unknown;
type ControllerClass = new (...args: never[]) => object;

function keyWithScopes(scopes: readonly string[]): ApiKeyDocument {
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
    scopes: [...scopes],
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
  controller: ControllerClass,
  handler: Handler,
): ExecutionContext {
  const request = {
    body: {},
    connection: { remoteAddress: '203.0.113.7' },
    headers: { authorization: 'Bearer gf_test_key' },
    ip: '203.0.113.7',
    method: 'GET',
    params: {},
    query: {},
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

const POST_READ_ROUTES: ReadonlyArray<
  readonly [string, ControllerClass, Handler]
> = [
  ['GET /posts', PostsController, PostsController.prototype.findAll],
  ['GET /posts/:postId', PostsController, PostsController.prototype.findOne],
];

const ACCOUNT_READ_ROUTES: ReadonlyArray<
  readonly [string, ControllerClass, Handler]
> = [
  [
    'GET /credentials',
    CredentialsController,
    CredentialsController.prototype.findAll,
  ],
  [
    'GET /credentials/:credentialId/instagram/pages',
    CredentialsController,
    CredentialsController.prototype.findAllInstagramPages,
  ],
  [
    'GET /services/linkedin/:credentialId/accounts',
    LinkedInController,
    LinkedInController.prototype.findAllAccounts,
  ],
  [
    'GET /credentials/brand/:brandId/publishing-readiness',
    CredentialsPublishingController,
    CredentialsPublishingController.prototype.listBrandPublishingReadiness,
  ],
  [
    'GET /credentials/brand/:brandId/account-health',
    CredentialsPublishingController,
    CredentialsPublishingController.prototype.listBrandAccountHealth,
  ],
  [
    'GET /credentials/:credentialId/next-slot',
    CredentialsPublishingController,
    CredentialsPublishingController.prototype.findNextPostingSlot,
  ],
];

const IMAGES_AND_ANALYTICS = ['images:read', 'analytics:read'] as const;

describe('Posts read scope', () => {
  it.each(POST_READ_ROUTES)(
    '%s refuses a key with other read scopes only',
    async (_route, controller, handler) => {
      await expect(
        buildGuard(keyWithScopes(IMAGES_AND_ANALYTICS)).canActivate(
          routeContext(controller, handler),
        ),
      ).rejects.toThrow('Insufficient permissions');
    },
  );

  it.each(POST_READ_ROUTES)(
    '%s lets a key with posts:read read',
    async (_route, controller, handler) => {
      await expect(
        buildGuard(keyWithScopes(['posts:read'])).canActivate(
          routeContext(controller, handler),
        ),
      ).resolves.toBe(true);
    },
  );

  it.each(POST_READ_ROUTES)(
    '%s lets a key with posts:draft read',
    async (_route, controller, handler) => {
      await expect(
        buildGuard(keyWithScopes(['posts:draft'])).canActivate(
          routeContext(controller, handler),
        ),
      ).resolves.toBe(true);
    },
  );
});

describe('Connected accounts read scope', () => {
  it.each(ACCOUNT_READ_ROUTES)(
    '%s refuses a key with other read scopes only',
    async (_route, controller, handler) => {
      await expect(
        buildGuard(keyWithScopes(IMAGES_AND_ANALYTICS)).canActivate(
          routeContext(controller, handler),
        ),
      ).rejects.toThrow('Insufficient permissions');
    },
  );

  it.each(ACCOUNT_READ_ROUTES)(
    '%s lets a key with credentials:read read',
    async (_route, controller, handler) => {
      await expect(
        buildGuard(keyWithScopes(['credentials:read'])).canActivate(
          routeContext(controller, handler),
        ),
      ).resolves.toBe(true);
    },
  );

  it.each(ACCOUNT_READ_ROUTES)(
    '%s lets a key with posts:schedule read',
    async (_route, controller, handler) => {
      await expect(
        buildGuard(keyWithScopes(['posts:schedule'])).canActivate(
          routeContext(controller, handler),
        ),
      ).resolves.toBe(true);
    },
  );

  it.each(Object.entries(API_KEY_SCOPE_PRESETS))(
    'keeps the %s preset on connected accounts',
    async (_preset, scopes) => {
      await expect(
        buildGuard(keyWithScopes(scopes)).canActivate(
          routeContext(
            CredentialsController,
            CredentialsController.prototype.findAll,
          ),
        ),
      ).resolves.toBe(true);
    },
  );
});
