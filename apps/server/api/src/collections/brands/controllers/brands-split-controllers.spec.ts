import { BrandsModule } from '@api/collections/brands/brands.module';
import { BrandOsRevisionsController } from '@api/collections/brands/controllers/brand-os-revisions.controller';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandsSetupController } from '@api/collections/brands/controllers/brands-setup.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
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

  it('registers the setup sibling before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BrandsModule),
    ).toEqual([
      BrandOsRevisionsController,
      BrandsAgentConfigController,
      BrandsSetupController,
      BrandsController,
      BrandsRelationshipsController,
    ]);
  });
});
