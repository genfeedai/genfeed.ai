import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { OrganizationsOperationsController } from '@api/collections/organizations/controllers/organizations-operations.controller';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

describe('Organizations split controllers', () => {
  it.each([
    [OrganizationsController, 'findAll', '/', RequestMethod.GET],
    [OrganizationsController, 'findBySlug', 'by-slug/:slug', RequestMethod.GET],
    [OrganizationsController, 'create', '/', RequestMethod.POST],
    [
      OrganizationsOperationsController,
      'switchOrganization',
      ':id/activate',
      RequestMethod.PATCH,
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
});
