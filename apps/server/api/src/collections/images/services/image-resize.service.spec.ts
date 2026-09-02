import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImageResizeService } from '@api/collections/images/services/image-resize.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
} from '@genfeedai/contracts';
import type { IResizeBodyParams } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';

describe('ImageResizeService', () => {
  const imageId = testId('image');
  const resizedImageId = testId('resized');
  const metadataId = testId('metadata');
  const resizedBuffer = Buffer.from('resized');
  const user = {
    brandId: testId('brand'),
    id: testId('session-user'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;
  const sourceImage = { id: imageId };
  const generatedImage = { id: resizedImageId };
  const updatedImage = {
    ...generatedImage,
    status: IngredientStatus.GENERATED,
  };

  let service: ImageResizeService;
  let configService: { ingredientsEndpoint: string };
  let filesClientService: {
    resizeImageFromUrl: ReturnType<typeof vi.fn>;
    uploadToS3: ReturnType<typeof vi.fn>;
  };
  let imagesService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let loggerService: { error: ReturnType<typeof vi.fn> };
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let sharedService: { createMediaDocuments: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    configService = {
      ingredientsEndpoint: 'https://api.example.com/ingredients',
    };
    filesClientService = {
      resizeImageFromUrl: vi.fn().mockResolvedValue(resizedBuffer),
      uploadToS3: vi.fn().mockResolvedValue({
        height: 720,
        publicUrl: 'https://cdn.example.com/resized.jpg',
        s3Key: `ingredients/images/${resizedImageId}`,
        size: 2048,
        width: 1280,
      }),
    };
    imagesService = {
      findOne: vi.fn().mockResolvedValue(sourceImage),
      patch: vi.fn().mockResolvedValue(updatedImage),
    };
    loggerService = { error: vi.fn() };
    metadataService = { patch: vi.fn() };
    sharedService = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: generatedImage,
        metadataData: { id: metadataId },
      }),
    };

    service = new ImageResizeService(
      configService as unknown as ConfigService,
      filesClientService as unknown as FilesClientService,
      imagesService as unknown as ImagesService,
      loggerService as unknown as LoggerService,
      metadataService as unknown as MetadataService,
      sharedService as unknown as SharedService,
    );
  });

  it('creates, resizes, uploads, and persists the generated child image', async () => {
    const body: IResizeBodyParams = { height: 720, width: 1280 };

    await expect(service.resizeImage(imageId, user, body)).resolves.toBe(
      updatedImage,
    );

    expect(imagesService.findOne).toHaveBeenCalledWith({
      id: imageId,
      userId: user.userId,
    });
    expect(sharedService.createMediaDocuments).toHaveBeenCalledWith(user, {
      brandId: user.brandId,
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.IMAGE,
      ),
      extension: MetadataExtension.JPG,
      organizationId: user.organizationId,
      parentId: imageId,
      status: IngredientStatus.PROCESSING,
    });
    expect(filesClientService.resizeImageFromUrl).toHaveBeenCalledWith(
      `https://api.example.com/ingredients/images/${imageId}`,
      { height: 720, width: 1280 },
    );
    expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
      resizedImageId,
      'images',
      {
        contentType: 'image/jpeg',
        data: resizedBuffer,
        type: FileInputType.BUFFER,
      },
    );
    expect(metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({ height: 720, size: 2048, width: 1280 }),
    );
    expect(imagesService.patch).toHaveBeenCalledWith(resizedImageId, {
      cdnUrl: 'https://cdn.example.com/resized.jpg',
      s3Key: `ingredients/images/${resizedImageId}`,
      status: IngredientStatus.GENERATED,
      transformations: [TransformationCategory.RESIZED],
    });
  });

  it('uses legacy dimensions and upload metadata fallbacks', async () => {
    filesClientService.uploadToS3.mockResolvedValue({});
    imagesService.patch.mockResolvedValue(null);

    await expect(
      service.resizeImage(imageId, user, {} as IResizeBodyParams),
    ).resolves.toBe(generatedImage);

    expect(filesClientService.resizeImageFromUrl).toHaveBeenCalledWith(
      `https://api.example.com/ingredients/images/${imageId}`,
      { height: 1920, width: 1080 },
    );
    expect(metadataService.patch).toHaveBeenCalledWith(
      metadataId,
      expect.objectContaining({
        height: 1920,
        size: resizedBuffer.length,
        width: 1080,
      }),
    );
    expect(imagesService.patch).toHaveBeenCalledWith(
      resizedImageId,
      expect.objectContaining({ cdnUrl: undefined, s3Key: undefined }),
    );
  });

  it('falls back to the canonical session user id for the scoped lookup', async () => {
    const legacyUser = { ...user, userId: undefined } as unknown as User;

    await service.resizeImage(imageId, legacyUser, {
      height: 720,
      width: 1280,
    });

    expect(imagesService.findOne).toHaveBeenCalledWith({
      id: imageId,
      userId: legacyUser.id,
    });
  });

  it('preserves the legacy not-found category for inaccessible images', async () => {
    imagesService.findOne.mockResolvedValue(null);

    await expect(
      service.resizeImage(imageId, user, { height: 720, width: 1280 }),
    ).rejects.toMatchObject({
      response: {
        detail: `ImagesTransformationsController ${imageId} doesn't exist`,
        title: 'ImagesTransformationsController not found',
      },
      status: HttpStatus.NOT_FOUND,
    });
    expect(sharedService.createMediaDocuments).not.toHaveBeenCalled();
  });

  it('logs processing failures with the legacy operation name and rethrows', async () => {
    const error = new Error('resize failed');
    filesClientService.resizeImageFromUrl.mockRejectedValue(error);

    await expect(
      service.resizeImage(imageId, user, { height: 720, width: 1280 }),
    ).rejects.toBe(error);
    expect(loggerService.error).toHaveBeenCalledWith(
      'ImagesTransformationsController resizeImage failed',
      error,
    );
  });
});
