import { readFileSync } from 'node:fs';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesResizeController } from '@api/collections/images/controllers/transformations/images-resize.controller';
import { ImagesTransformationsController } from '@api/collections/images/controllers/transformations/images-transformations.controller';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { ImagesModule } from '@api/collections/images/images.module';
import { ImageResizeService } from '@api/collections/images/services/image-resize.service';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { RequestMethod } from '@nestjs/common';
import {
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

describe('Images split controllers', () => {
  it('preserves the resize route and legacy OpenAPI identity', () => {
    const handler = ImagesResizeController.prototype.resizeImage;

    expect(Reflect.getMetadata(PATH_METADATA, ImagesResizeController)).toBe(
      'images',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':imageId/resize');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: 'ImagesTransformationsController.resizeImage',
      summary: 'resizeImage',
    });
  });

  it('preserves credit interception on both transformation transports', () => {
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, ImagesResizeController),
    ).toContain(CreditsInterceptor);
    expect(
      Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        ImagesTransformationsController,
      ),
    ).toContain(CreditsInterceptor);
  });

  it('registers the resize sibling before the transformations controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ImagesModule),
    ).toEqual([
      ImagesController,
      ImagesOperationsController,
      ImagesRelationshipsController,
      ImagesResizeController,
      ImagesTransformationsController,
      ImagesUploadsController,
    ]);
  });

  it('registers resize orchestration in the owning module', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ImagesModule),
    ).toContain(ImageResizeService);
  });

  it('removes resizeImage from the transformations controller', () => {
    expect(
      ImagesTransformationsController.prototype.resizeImage,
    ).toBeUndefined();
  });

  it.each([
    './transformations/images-transformations.controller.ts',
    './transformations/images-resize.controller.ts',
    '../services/image-resize.service.ts',
  ])('keeps %s below 500 lines', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    expect(source.trimEnd().split('\n').length).toBeLessThan(500);
  });
});
