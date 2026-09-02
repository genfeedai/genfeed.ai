vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsIngestionController } from '@api/collections/assets/controllers/operations/assets-ingestion.controller';
import type { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import type { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { AssetIngestionService } from '@api/collections/assets/services/asset-ingestion.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { AssetSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

describe('AssetsIngestionController', () => {
  const asset = {
    category: AssetCategory.LOGO,
    id: 'cmasset000000000000000001',
    parentBrandId: 'cmbrand000000000000000001',
    parentType: AssetParent.BRAND,
  };
  const file = {
    buffer: Buffer.from('file'),
    mimetype: 'image/png',
    originalname: 'logo.png',
    size: 1024,
  } as Express.Multer.File;
  const user = {
    id: 'cmuser0000000000000000001',
    organizationId: 'cmorganization000000000000001',
  } as User;
  const request = {
    originalUrl: '/api/assets/upload',
    query: {},
  } as Request;
  const ingestionService = {
    createFromIngredient: vi.fn(),
    createUpload: vi.fn(),
  };
  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const controller = new AssetsIngestionController(
    ingestionService as unknown as AssetIngestionService,
    loggerService as unknown as LoggerService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates upload ingestion and preserves the canonical asset envelope', async () => {
    const dto: CreateAssetDto = {
      category: AssetCategory.LOGO,
      parentId: asset.parentBrandId,
      parentType: AssetParent.BRAND,
    };
    ingestionService.createUpload.mockResolvedValue(asset);

    await expect(
      controller.createUpload(request, user, file, dto),
    ).resolves.toEqual({ data: asset });

    expect(ingestionService.createUpload).toHaveBeenCalledWith(user, file, dto);
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AssetSerializer,
      asset,
    );
    expect(loggerService.log).toHaveBeenCalledWith(
      'AssetsIngestionController.createUpload started',
      expect.objectContaining({
        operation: 'createUpload',
        service: 'AssetsIngestionController',
      }),
    );
  });

  it('delegates ingredient ingestion and preserves the canonical asset envelope', async () => {
    const dto: CreateFromIngredientDto = {
      category: AssetCategory.LOGO,
      ingredientId: 'cmingredient000000000000001',
      parentId: asset.parentBrandId,
    };
    ingestionService.createFromIngredient.mockResolvedValue(asset);

    await expect(
      controller.createFromIngredient(request, user, dto),
    ).resolves.toEqual({ data: asset });

    expect(ingestionService.createFromIngredient).toHaveBeenCalledWith(
      user,
      dto,
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      AssetSerializer,
      asset,
    );
  });
});
