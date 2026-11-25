import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
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

type Handler = (...args: never[]) => unknown;
type ControllerClass = new (...args: never[]) => object;

function routeContext(
  controller: ControllerClass,
  handler: Handler,
  method: string,
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

const ACCOUNT_ROUTES: ReadonlyArray<
  readonly [string, ControllerClass, Handler, string]
> = [
  [
    'GET /organizations/:organizationId/integrations',
    OrganizationsIntegrationsController,
    OrganizationsIntegrationsController.prototype.findAll,
    'GET',
  ],
  [
    'GET /organizations/:organizationId/integrations/:id',
    OrganizationsIntegrationsController,
    OrganizationsIntegrationsController.prototype.findOne,
    'GET',
  ],
  [
    'POST /organizations/:organizationId/integrations',
    OrganizationsIntegrationsController,
    OrganizationsIntegrationsController.prototype.create,
    'POST',
  ],
  [
    'PATCH /organizations/:organizationId/integrations/:id',
    OrganizationsIntegrationsController,
    OrganizationsIntegrationsController.prototype.update,
    'PATCH',
  ],
  [
    'DELETE /organizations/:organizationId/integrations/:id',
    OrganizationsIntegrationsController,
    OrganizationsIntegrationsController.prototype.remove,
    'DELETE',
  ],
  [
    'POST /organizations',
    OrganizationsController,
    OrganizationsController.prototype.create,
    'POST',
  ],
  [
    'POST /credentials/:credentialId/refresh',
    CredentialsController,
    CredentialsController.prototype.refreshCredentialToken,
    'POST',
  ],
  [
    'POST /credentials/:credentialId/tags',
    CredentialsController,
    CredentialsController.prototype.createCredentialTag,
    'POST',
  ],
  [
    'POST /credentials/:credentialId/account-health/assess',
    CredentialsPublishingController,
    CredentialsPublishingController.prototype.assessAccountHealth,
    'POST',
  ],
  [
    'PATCH /users/me',
    UsersController,
    UsersController.prototype.updateMe,
    'PATCH',
  ],
  [
    'POST /users/me/avatar',
    UsersController,
    UsersController.prototype.getAvatarUploadUrl,
    'POST',
  ],
  [
    'PATCH /users/me/settings',
    UsersRelationshipsController,
    UsersRelationshipsController.prototype.updateMeSettings,
    'PATCH',
  ],
  [
    'PATCH /users/:userId/settings',
    UsersRelationshipsController,
    UsersRelationshipsController.prototype.updateSettings,
    'PATCH',
  ],
  [
    'PATCH /users/me/organizations/:organizationId',
    UsersRelationshipsController,
    UsersRelationshipsController.prototype.updateOrganizationSelection,
    'PATCH',
  ],
  [
    'PATCH /users/me/brands/:brandId',
    UsersRelationshipsController,
    UsersRelationshipsController.prototype.updateBrandSelection,
    'PATCH',
  ],
];

describe.each(ACCOUNT_ROUTES)(
  '%s API key scope',
  (_route, controller, handler, method) => {
    it.each([
      [['images:create', 'videos:create', 'brands:write', 'posts:publish']],
      [['images:read', 'brands:read', 'credentials:read']],
    ])('refuses a key with only resource scopes %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, method)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it('allows a key with the admin scope', async () => {
      const guard = buildGuard(keyWithScopes(['admin']));

      await expect(
        guard.canActivate(routeContext(controller, handler, method)),
      ).resolves.toBe(true);
    });
  },
);

describe('organization integrations route coverage', () => {
  it('lists every handler of the controller in the scope table', () => {
    const handlers = Object.getOwnPropertyNames(
      OrganizationsIntegrationsController.prototype,
    ).filter(
      (name) =>
        Reflect.getMetadata(
          METHOD_METADATA,
          (
            OrganizationsIntegrationsController.prototype as unknown as Record<
              string,
              object
            >
          )[name],
        ) !== undefined,
    );
    const listed = ACCOUNT_ROUTES.filter(
      ([, controller]) => controller === OrganizationsIntegrationsController,
    ).map(([, , handler]) => handler.name);

    expect(handlers.sort()).toEqual(listed.sort());
  });
});
