vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImagesReframeController } from '@api/collections/images/controllers/transformations/images-reframe.controller';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { ImageReframeService } from '@api/collections/images/services/image-reframe.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  RATE_LIMIT_KEY,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ActivitySource, ModelCategory } from '@genfeedai/enums';
import type { CreditsConfig } from '@genfeedai/interfaces';
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

describe('ImagesReframeController', () => {
  const imageId = testId('image');
  const request = {
    originalUrl: `/api/images/${imageId}/reframe`,
    params: { imageId },
    query: {},
  } as unknown as Request;
  const user = {
    brandId: testId('brand'),
    id: testId('session-user'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const body = Object.assign(new CreateImageDto(), {
    format: 'landscape',
    text: 'Reframe to landscape',
  });
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
  };
  const imageReframeService = {
    reframeImage: vi.fn(),
  };
  const controller = new ImagesReframeController(
    loggerService as unknown as LoggerService,
    imageReframeService as unknown as ImageReframeService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates the unchanged request contract and serializes the processing ingredient', async () => {
    const reframedImage = { id: testId('reframed'), status: 'PROCESSING' };
    imageReframeService.reframeImage.mockResolvedValue(reframedImage);

    await expect(
      controller.reframeImage(request, imageId, user, body),
    ).resolves.toEqual({ data: reframedImage });

    expect(imageReframeService.reframeImage).toHaveBeenCalledWith(
      request,
      imageId,
      user,
      body,
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      IngredientSerializer,
      reframedImage,
    );
    expect(loggerService.log).toHaveBeenCalledWith(
      'ImagesReframeController.reframeImage started',
      expect.objectContaining({
        operation: 'reframeImage',
        service: 'ImagesReframeController',
      }),
    );
  });

  it('preserves the route, legacy OpenAPI identity, and runtime body DTO', () => {
    const handler = ImagesReframeController.prototype.reframeImage;
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      ImagesReframeController.prototype,
      'reframeImage',
    ) as unknown[];

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
    expect(parameterTypes[3]).toBe(CreateImageDto);
  });

  it('preserves credit interception, external rate limiting, and guard order', () => {
    const handler = ImagesReframeController.prototype.reframeImage;

    expect(
      Reflect.getMetadata(INTERCEPTORS_METADATA, ImagesReframeController),
    ).toContain(CreditsInterceptor);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, handler)).toEqual(
      RateLimitPresets.external,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      SubscriptionGuard,
      CreditsGuard,
      ModelsGuard,
    ]);
  });

  it('preserves credits and model-validation metadata', () => {
    const handler = ImagesReframeController.prototype.reframeImage;
    const reflector = new Reflector();

    expect(Reflect.getMetadata(CREDITS_KEY, handler) as CreditsConfig).toEqual({
      description: 'Image reframe',
      modelKey: MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
      source: ActivitySource.IMAGE_REFRAME,
    });
    expect(reflector.get(ValidateModel, handler)).toEqual({
      category: ModelCategory.IMAGE_EDIT,
    });
  });
});
