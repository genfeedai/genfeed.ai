import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UsersNotificationInboxController } from '@api/collections/users/controllers/users-notification-inbox.controller';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import { UsersModule } from '@api/collections/users/users.module';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Users split controllers', () => {
  it.each([
    ['findMeBrands', 'me/brands', RequestMethod.GET],
    ['findMeSettings', 'me/settings', RequestMethod.GET],
    ['updateMeSettings', 'me/settings', RequestMethod.PATCH],
    ['findMeOrganizations', 'me/organizations', RequestMethod.GET],
    [
      'updateOrganizationSelection',
      'me/organizations/:organizationId',
      RequestMethod.PATCH,
    ],
    ['updateBrandSelection', 'me/brands/:brandId', RequestMethod.PATCH],
    ['updateSettings', ':userId/settings', RequestMethod.PATCH],
  ] as const)(
    'preserves %s route and OpenAPI metadata',
    (methodName, path, method) => {
      const handler = Reflect.get(
        UsersRelationshipsController.prototype,
        methodName,
      ) as object;

      expect(
        Reflect.getMetadata(PATH_METADATA, UsersRelationshipsController),
      ).toBe('users');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({
        operationId: `UsersController.${methodName}`,
        summary: methodName,
      });
    },
  );

  it('preserves the shared users role guard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UsersRelationshipsController),
    ).toContain(RolesGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersController)).toContain(
      RolesGuard,
    );
  });

  it('registers static relationships routes before wildcard user routes', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      UsersModule,
    );

    expect(controllers).toEqual([
      UsersNotificationInboxController,
      UsersRelationshipsController,
      UsersController,
    ]);
  });
});
