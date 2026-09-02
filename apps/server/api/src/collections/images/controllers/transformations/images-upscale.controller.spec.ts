vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImagesUpscaleController } from '@api/collections/images/controllers/transformations/images-upscale.controller';
import { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';
import type { ImageUpscaleService } from '@api/collections/images/services/image-upscale.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ActivitySource, ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

describe('ImagesUpscaleController', () => {
  const imageId = testId('image');
  const request = {
    originalUrl: `/api/images/${imageId}/upscale`,
    params: { imageId },
    query: {},
  } as unknown as Request;
  const user = {
    brandId: testId('brand'),
    id: testId('session-user'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const body = Object.assign(new ImageEditDto(), {
    model: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
    outputFormat: 'jpg',
    upscaleFactor: '4x',
  });
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
  };
  const imageUpscaleService = {
    upscaleImage: vi.fn(),
  };
  const controller = new ImagesUpscaleController(
    loggerService as unknown as LoggerService,
    imageUpscaleService as unknown as ImageUpscaleService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates the unchanged request contract and serializes the processing ingredient', async () => {
    const upscaledImage = { id: testId('upscaled'), status: 'PROCESSING' };
    imageUpscaleService.upscaleImage.mockResolvedValue(upscaledImage);

    await expect(
      controller.upscaleImage(request, imageId, user, body),
    ).resolves.toEqual({ data: upscaledImage });

    expect(imageUpscaleService.upscaleImage).toHaveBeenCalledWith(
      request,
      imageId,
      user,
      body,
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      IngredientSerializer,
      upscaledImage,
    );
    expect(loggerService.log).toHaveBeenCalledWith(
      'ImagesUpscaleController.upscaleImage started',
      expect.objectContaining({
        operation: 'upscaleImage',
        service: 'ImagesUpscaleController',
      }),
    );
  });

  it('preserves the route, legacy OpenAPI identity, and runtime body DTO', () => {
    const handler = ImagesUpscaleController.prototype.upscaleImage;
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      ImagesUpscaleController.prototype,
      'upscaleImage',
    ) as unknown[];

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
    expect(parameterTypes[3]).toBe(ImageEditDto);
  });

  it('preserves credit interception and guard order', () => {
    const handler = ImagesUpscaleController.prototype.upscaleImage;

    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, ImagesUpscaleController),
    ).toContain(CreditsInterceptor);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      SubscriptionGuard,
      CreditsGuard,
      ModelsGuard,
    ]);
  });

  it('preserves credits and model-validation metadata', () => {
    const handler = ImagesUpscaleController.prototype.upscaleImage;
    const reflector = new Reflector();

    expect(Reflect.getMetadata(CREDITS_KEY, handler) as CreditsConfig).toEqual({
      description: 'Image upscaling',
      modelKey: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      source: ActivitySource.IMAGE_UPSCALE,
    });
    expect(reflector.get(ValidateModel, handler)).toEqual({
      category: ModelCategory.IMAGE_EDIT,
    });
  });
});
