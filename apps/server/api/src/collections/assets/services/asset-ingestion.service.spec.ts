import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import type { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { AssetIngestionService } from '@api/collections/assets/services/asset-ingestion.service';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  AssetCategory,
  AssetParent,
  FileInputType,
  IngredientCategory,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';

describe('AssetIngestionService', () => {
  const userId = testId('user');
  const brandId = testId('brand');
  const ingredientId = testId('ingredient');
  const metadataId = testId('metadata');
  const assetId = testId('asset');
  const user = {
    id: 'legacy-user-id',
    organizationId: testId('organization'),
    userId,
  } as User;
  const file = {
    buffer: Buffer.from('file'),
    mimetype: 'image/png',
    originalname: 'logo.png',
    size: 1024,
  } as Express.Multer.File;
  const uploadDto: CreateAssetDto = {
    category: AssetCategory.LOGO,
    parentId: brandId,
    parentType: AssetParent.BRAND,
  };
  const ingredientDto: CreateFromIngredientDto = {
    category: AssetCategory.LOGO,
    ingredientId,
    parentId: brandId,
  };
  const asset = {
    category: AssetCategory.LOGO,
    id: assetId,
    parentBrandId: brandId,
    parentType: AssetParent.BRAND,
    userId,
  };
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: ingredientId,
    metadataId,
    userId,
  } as IngredientDocument;
  const assetsService = {
    create: vi.fn(),
    patchAll: vi.fn(),
    remove: vi.fn(),
  };
  const cacheService = {
    del: vi.fn(),
    invalidateByTags: vi.fn(),
  };
  const filesClientService = {
    copyInS3: vi.fn(),
    uploadToS3: vi.fn(),
  };
  const ingredientsService = {
    findOne: vi.fn(),
  };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const metadataService = {
    findOne: vi.fn(),
  };
  const websocketService = {
    publishAssetStatus: vi.fn(),
    publishBrandRefresh: vi.fn(),
  };
  const service = new AssetIngestionService(
    assetsService as unknown as AssetsService,
    cacheService as unknown as CacheService,
    filesClientService as unknown as FilesClientService,
    ingredientsService as unknown as IngredientsService,
    loggerService as unknown as LoggerService,
    metadataService as unknown as MetadataService,
    websocketService as unknown as NotificationsPublisherService,
  );

  beforeEach(() => {
    assetsService.create.mockResolvedValue(asset);
    assetsService.patchAll.mockResolvedValue({ modifiedCount: 1 });
    assetsService.remove.mockResolvedValue(asset);
    cacheService.del.mockResolvedValue(1);
    cacheService.invalidateByTags.mockResolvedValue(4);
    filesClientService.copyInS3.mockResolvedValue({});
    filesClientService.uploadToS3.mockResolvedValue({});
    ingredientsService.findOne.mockResolvedValue(ingredient);
    metadataService.findOne.mockResolvedValue({ id: metadataId });
    websocketService.publishAssetStatus.mockResolvedValue(undefined);
    websocketService.publishBrandRefresh.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads the asset after replacing the prior brand image and invalidating caches', async () => {
    await expect(service.createUpload(user, file, uploadDto)).resolves.toBe(
      asset,
    );

    expect(assetsService.patchAll).toHaveBeenCalledWith(
      {
        category: AssetCategory.LOGO,
        parentBrandId: brandId,
        parentType: AssetParent.BRAND,
      },
      { isDeleted: true },
    );
    expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
      'brands',
      'links',
      'assets',
      'public',
    ]);
    expect(cacheService.del).toHaveBeenCalledWith(`brand:${brandId}`);
    expect(assetsService.create).toHaveBeenCalledWith({
      category: AssetCategory.LOGO,
      parentId: brandId,
      parentType: AssetParent.BRAND,
      userId,
    });
    expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
      assetId,
      'logos',
      {
        contentType: 'image/png',
        data: file.buffer,
        type: FileInputType.BUFFER,
      },
    );
    expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
      assetId,
      'completed',
      userId,
      {
        assetId,
        category: AssetCategory.LOGO,
        parentId: brandId,
        parentType: AssetParent.BRAND,
      },
    );
    expect(websocketService.publishBrandRefresh).toHaveBeenCalledWith(
      brandId,
      userId,
      { assetId, category: AssetCategory.LOGO },
    );
  });

  it('drops an invalid optional parent id before upload persistence', async () => {
    await service.createUpload(user, file, {
      category: AssetCategory.REFERENCE,
      parentId: 'invalid-id',
      parentType: AssetParent.BRAND,
    });

    expect(assetsService.create).toHaveBeenCalledWith({
      category: AssetCategory.REFERENCE,
      parentId: undefined,
      parentType: AssetParent.BRAND,
      userId,
    });
    expect(assetsService.patchAll).not.toHaveBeenCalled();
    expect(websocketService.publishBrandRefresh).not.toHaveBeenCalled();
  });

  it('publishes upload events with the canonical fallback user id', async () => {
    const fallbackUser = {
      ...user,
      userId: undefined,
    } as unknown as User;

    await service.createUpload(fallbackUser, file, uploadDto);

    expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
      assetId,
      'completed',
      fallbackUser.id,
      expect.any(Object),
    );
  });

  it('does not publish upload events without a user id', async () => {
    const userWithoutId = {
      organizationId: user.organizationId,
    } as User;

    await service.createUpload(userWithoutId, file, uploadDto);

    expect(websocketService.publishAssetStatus).not.toHaveBeenCalled();
    expect(websocketService.publishBrandRefresh).not.toHaveBeenCalled();
  });

  it('copies an owned image ingredient and publishes the exact completion payloads', async () => {
    await expect(
      service.createFromIngredient(user, ingredientDto),
    ).resolves.toBe(asset);

    expect(ingredientsService.findOne).toHaveBeenCalledWith({
      id: ingredientId,
      userId,
    });
    expect(metadataService.findOne).toHaveBeenCalledWith({ id: metadataId });
    expect(assetsService.patchAll).toHaveBeenCalledWith(
      {
        category: AssetCategory.LOGO,
        parentBrandId: brandId,
        parentType: AssetParent.BRAND,
      },
      { isDeleted: true },
    );
    expect(assetsService.create).toHaveBeenCalledWith({
      category: AssetCategory.LOGO,
      parentId: brandId,
      parentType: AssetParent.BRAND,
      userId,
    });
    expect(filesClientService.copyInS3).toHaveBeenCalledWith(
      ingredientId,
      assetId,
      'images',
      'logos',
    );
    expect(websocketService.publishAssetStatus).toHaveBeenCalledWith(
      assetId,
      'completed',
      userId,
      {
        assetId,
        category: AssetCategory.LOGO,
        parentId: brandId,
        parentType: AssetParent.BRAND,
      },
    );
    expect(websocketService.publishBrandRefresh).toHaveBeenCalledWith(
      brandId,
      userId,
      { assetId, category: AssetCategory.LOGO },
    );
  });

  it('preserves ingredient not-found behavior for the scoped lookup', async () => {
    ingredientsService.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createFromIngredient(user, ingredientDto),
    ).rejects.toBeInstanceOf(HttpException);
    expect(assetsService.patchAll).not.toHaveBeenCalled();
  });

  it('does not publish ingredient events without a user id', async () => {
    const userWithoutId = {
      organizationId: user.organizationId,
    } as User;

    await service.createFromIngredient(userWithoutId, ingredientDto);

    expect(websocketService.publishAssetStatus).not.toHaveBeenCalled();
    expect(websocketService.publishBrandRefresh).not.toHaveBeenCalled();
  });

  it('rejects non-logo and non-banner ingredient destinations before reads', async () => {
    await expect(
      service.createFromIngredient(user, {
        ...ingredientDto,
        category: AssetCategory.REFERENCE,
      }),
    ).rejects.toThrow(ValidationException);
    expect(ingredientsService.findOne).not.toHaveBeenCalled();
  });

  it('rejects non-image ingredients', async () => {
    ingredientsService.findOne.mockResolvedValueOnce({
      ...ingredient,
      category: IngredientCategory.VIDEO,
    });

    await expect(
      service.createFromIngredient(user, ingredientDto),
    ).rejects.toMatchObject({
      response: {
        detail: 'Only images can be set as logo or banner',
        title: 'Validation Error',
      },
    });
    expect(metadataService.findOne).not.toHaveBeenCalled();
  });

  it.each([
    [
      'missing metadata id',
      { ...ingredient, metadataId: undefined },
      undefined,
    ],
    ['missing metadata record', ingredient, null],
  ] as const)('rejects %s', async (_name, foundIngredient, foundMetadata) => {
    ingredientsService.findOne.mockResolvedValueOnce(foundIngredient);
    if (foundMetadata !== undefined) {
      metadataService.findOne.mockResolvedValueOnce(foundMetadata);
    }

    await expect(
      service.createFromIngredient(user, ingredientDto),
    ).rejects.toMatchObject({
      response: {
        detail: 'Ingredient metadata not found',
        title: 'Validation Error',
      },
    });
    expect(filesClientService.copyInS3).not.toHaveBeenCalled();
  });

  it('rolls back the created asset when the ingredient copy fails', async () => {
    filesClientService.copyInS3.mockRejectedValueOnce(new Error('S3 failure'));

    await expect(
      service.createFromIngredient(user, ingredientDto),
    ).rejects.toMatchObject({
      response: {
        detail:
          'Failed to copy ingredient file. The source file may not exist or there was an S3 error.',
        title: 'Validation Error',
      },
    });

    expect(assetsService.remove).toHaveBeenCalledWith(assetId);
    expect(cacheService.invalidateByTags).not.toHaveBeenCalled();
    expect(websocketService.publishAssetStatus).not.toHaveBeenCalled();
  });
});
