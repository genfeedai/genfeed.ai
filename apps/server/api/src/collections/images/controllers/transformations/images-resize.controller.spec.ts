vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImagesResizeController } from '@api/collections/images/controllers/transformations/images-resize.controller';
import type { ImageResizeService } from '@api/collections/images/services/image-resize.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { IResizeBodyParams } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

describe('ImagesResizeController', () => {
  const imageId = testId('image');
  const request = {
    originalUrl: `/api/images/${imageId}/resize`,
    params: { imageId },
    query: {},
  } as unknown as Request;
  const user = {
    brandId: testId('brand'),
    id: testId('session-user'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const body: IResizeBodyParams = { height: 720, width: 1280 };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
  };
  const imageResizeService = {
    resizeImage: vi.fn(),
  };
  const controller = new ImagesResizeController(
    loggerService as unknown as LoggerService,
    imageResizeService as unknown as ImageResizeService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates resize and preserves the serialized ingredient envelope', async () => {
    const resizedImage = { id: testId('resized') };
    imageResizeService.resizeImage.mockResolvedValue(resizedImage);

    await expect(
      controller.resizeImage(request, user, imageId, body),
    ).resolves.toEqual({ data: resizedImage });

    expect(imageResizeService.resizeImage).toHaveBeenCalledWith(
      imageId,
      user,
      body,
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      IngredientSerializer,
      resizedImage,
    );
    expect(loggerService.log).toHaveBeenCalledWith(
      'ImagesResizeController.resizeImage started',
      expect.objectContaining({
        operation: 'resizeImage',
        service: 'ImagesResizeController',
      }),
    );
  });
});
