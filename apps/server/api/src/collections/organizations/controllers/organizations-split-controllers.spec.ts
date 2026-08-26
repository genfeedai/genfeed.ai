import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsIntegrationsController } from '@api/collections/organizations/controllers/organizations-integrations.controller';
import { OrganizationsMembersController } from '@api/collections/organizations/controllers/organizations-members.controller';
import { OrganizationsOperationsController } from '@api/collections/organizations/controllers/organizations-operations.controller';
import { OrganizationsRelationshipsController } from '@api/collections/organizations/controllers/organizations-relationships.controller';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Organizations split controllers', () => {
  it.each([
    [OrganizationsController, 'findAll', '/', RequestMethod.GET],
    [OrganizationsController, 'findBySlug', 'by-slug/:slug', RequestMethod.GET],
    [OrganizationsController, 'create', '/', RequestMethod.POST],
    [
      OrganizationsOperationsController,
      'switchOrganization',
      'switch/:id',
      RequestMethod.POST,
    ],
  ] as const)(
    'preserves %s.%s route metadata',
    (controllerClass, methodName, path, method) => {
      const handler = Reflect.get(controllerClass.prototype, methodName);

      expect(Reflect.getMetadata(PATH_METADATA, controllerClass)).toBe(
        'organizations',
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ summary: methodName });
    },
  );

  it('preserves the moved route OpenAPI operation id', () => {
    expect(
      Reflect.getMetadata(
        'swagger/apiOperation',
        OrganizationsOperationsController.prototype.switchOrganization,
      ),
    ).toMatchObject({
      operationId: 'OrganizationsController.switchOrganization',
    });
  });

  it.each([OrganizationsController, OrganizationsOperationsController])(
    'preserves the shared organizations role guard',
    (controllerClass) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controllerClass)).toContain(
        RolesGuard,
      );
    },
  );

  it('registers every static sibling before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, OrganizationsModule),
    ).toEqual([
      OrganizationsIntegrationsController,
      OrganizationsMembersController,
      OrganizationsOperationsController,
      OrganizationsRelationshipsController,
      OrganizationsSettingsController,
      OrganizationsController,
    ]);
  });
});
