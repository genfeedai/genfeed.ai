import { readFileSync } from 'node:fs';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandsSetupController } from '@api/collections/brands/controllers/brands-setup.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Brands split controllers', () => {
  it.each([
    ['previewWebsite', 'website-preview', 'BrandsController.previewWebsite'],
    ['scrapeBrand', ':id/scrape', 'BrandsController.scrapeBrand'],
    [
      'addReferenceImages',
      ':id/reference-images',
      'BrandsController.addReferenceImages',
    ],
  ] as const)(
    'preserves BrandsController.%s route and OpenAPI metadata',
    (methodName, path, operationId) => {
      const handler = Reflect.get(
        BrandsSetupController.prototype,
        methodName,
      ) as object;

      expect(Reflect.getMetadata(PATH_METADATA, BrandsSetupController)).toBe(
        'brands',
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
        HttpStatus.OK,
      );
      expect(
        Reflect.getMetadata('swagger/apiOperation', handler),
      ).toMatchObject({ operationId, summary: methodName });
    },
  );

  it.each([BrandsController, BrandsSetupController])(
    'preserves the shared brands role guard on %s',
    (controllerClass) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controllerClass)).toContain(
        RolesGuard,
      );
    },
  );

  it('registers the setup sibling before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BrandsModule),
    ).toEqual([
      BrandsAgentConfigController,
      BrandsSetupController,
      BrandsController,
      BrandsRelationshipsController,
    ]);
  });

  it.each(['previewWebsite', 'scrapeBrand', 'addReferenceImages'] as const)(
    'removes moved handler %s from the CRUD controller',
    (methodName) => {
      expect(
        Reflect.get(BrandsController.prototype, methodName),
      ).toBeUndefined();
    },
  );

  it('keeps the transport-focused CRUD controller below 500 lines', () => {
    const source = readFileSync(
      new URL('./brands.controller.ts', import.meta.url),
      'utf8',
    );

    expect(source.trimEnd().split('\n').length).toBeLessThan(500);
  });
});
