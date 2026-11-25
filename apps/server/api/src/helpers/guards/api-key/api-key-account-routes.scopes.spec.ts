import { CredentialsController } from '@api/collections/credentials/controllers/credentials.controller';
import { CredentialsPublishingController } from '@api/collections/credentials/controllers/credentials-publishing.controller';
import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { UnauthorizedException } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';

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
