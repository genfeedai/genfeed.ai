import { readFileSync } from 'node:fs';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesReframeController } from '@api/collections/images/controllers/transformations/images-reframe.controller';
import { ImagesResizeController } from '@api/collections/images/controllers/transformations/images-resize.controller';
import { ImagesTransformationsController } from '@api/collections/images/controllers/transformations/images-transformations.controller';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { ImagesModule } from '@api/collections/images/images.module';
import { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
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

  it('preserves the reframe route and legacy OpenAPI identity', () => {
    const handler = ImagesReframeController.prototype.reframeImage;

    expect(Reflect.getMetadata(PATH_METADATA, ImagesReframeController)).toBe(
      'images',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':imageId/reframe',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: 'ImagesTransformationsController.reframeImage',
      summary: 'reframeImage',
    });
  });

  it('preserves credit interception on every transformation transport', () => {
    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, ImagesReframeController),
    ).toContain(CreditsInterceptor);
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

  it('registers transformation siblings before the transformations controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ImagesModule),
    ).toEqual([
      ImagesController,
      ImagesOperationsController,
      ImagesRelationshipsController,
      ImagesResizeController,
      ImagesReframeController,
      ImagesTransformationsController,
      ImagesUploadsController,
    ]);
  });

  it('registers extracted transformation orchestration in the owning module', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ImagesModule,
    );

    expect(providers).toContain(ImageReframeService);
    expect(providers).toContain(ImageResizeService);
  });

  it('removes extracted methods from the transformations controller', () => {
    expect(
      ImagesTransformationsController.prototype.reframeImage,
    ).toBeUndefined();
    expect(
      ImagesTransformationsController.prototype.resizeImage,
    ).toBeUndefined();
  });

  it.each([
    './transformations/images-transformations.controller.ts',
    './transformations/images-reframe.controller.ts',
    './transformations/images-resize.controller.ts',
    '../services/image-reframe.service.ts',
    '../services/image-resize.service.ts',
  ])('keeps %s below 500 lines', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    expect(source.trimEnd().split('\n').length).toBeLessThan(500);
  });
});
