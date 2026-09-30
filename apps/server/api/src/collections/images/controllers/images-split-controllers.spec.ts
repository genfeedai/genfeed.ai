import { existsSync, readFileSync } from 'node:fs';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesReframeController } from '@api/collections/images/controllers/transformations/images-reframe.controller';
import { ImagesResizeController } from '@api/collections/images/controllers/transformations/images-resize.controller';
import { ImagesUpscaleController } from '@api/collections/images/controllers/transformations/images-upscale.controller';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { ImagesModule } from '@api/collections/images/images.module';
import { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
import { ImageResizeService } from '@api/collections/images/services/image-resize.service';
import { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
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

  it('preserves the upscale route and legacy OpenAPI identity', () => {
    const handler = ImagesUpscaleController.prototype.upscaleImage;

    expect(Reflect.getMetadata(PATH_METADATA, ImagesUpscaleController)).toBe(
      'images',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':imageId/upscale',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: 'ImagesTransformationsController.upscaleImage',
      summary: 'upscaleImage',
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
      Reflect.getMetadata(INTERCEPTORS_METADATA, ImagesUpscaleController),
    ).toContain(CreditsInterceptor);
  });

  it('registers transformation siblings in the established module order', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ImagesModule),
    ).toEqual([
      ImagesController,
      ImagesOperationsController,
      ImagesRelationshipsController,
      ImagesResizeController,
      ImagesReframeController,
      ImagesUpscaleController,
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
    expect(providers).toContain(ImageUpscaleService);
  });

  it('removes the empty legacy transformations controller file', () => {
    expect(
      existsSync(
        new URL(
          './transformations/images-transformations.controller.ts',
          import.meta.url,
        ),
      ),
    ).toBe(false);
  });

  it.each([
    './transformations/images-reframe.controller.ts',
    './transformations/images-resize.controller.ts',
    './transformations/images-upscale.controller.ts',
    '../services/image-reframe.service.ts',
    '../services/image-resize.service.ts',
    '../services/image-upscale.service.ts',
  ])('keeps %s below 500 lines', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    expect(source.trimEnd().split('\n').length).toBeLessThan(500);
  });
});
