vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, serializer, data) => ({
    data,
    serializer,
  })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsIngestionController } from '@api/collections/assets/controllers/operations/assets-ingestion.controller';
import type { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import type { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import type { AssetIngestionService } from '@api/collections/assets/services/asset-ingestion.service';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import { AssetSerializer } from '@genfeedai/serializers';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

type Asset = Record<string, unknown> & { id: string };

/**
 * Asset ingestion that stores each created asset with the caller and source,
 * and a logger that keeps what it was told.
 */
function buildController() {
  const assets: Asset[] = [];
  const logs: { context: Record<string, unknown>; message: string }[] = [];
  const store = (asset: Omit<Asset, 'id'>) => {
    const row = { ...asset, id: `asset-${assets.length + 1}` };
    assets.push(row);
    return row;
  };
  const ingestion = {
    createFromIngredient: async (user: User, dto: CreateFromIngredientDto) =>
      store({
        category: dto.category,
        organizationId: user.organizationId,
        parentId: dto.parentId,
        sourceIngredientId: dto.ingredientId,
      }),
    createUpload: async (
      user: User,
      file: Express.Multer.File,
      dto: CreateAssetDto,
    ) =>
      store({
        category: dto.category,
        organizationId: user.organizationId,
        parentId: dto.parentId,
        parentType: dto.parentType,
        uploadedFileName: file.originalname,
      }),
  };
  const record = (message: string, context: Record<string, unknown>) =>
    logs.push({ context, message });
  const controller = new AssetsIngestionController(
    ingestion as unknown as AssetIngestionService,
    {
      debug: record,
      error: record,
      log: record,
      warn: record,
    } as unknown as LoggerService,
  );
  return { assets, controller, logs };
}

describe('AssetsIngestionController', () => {
  const parentBrandId = 'cmbrand000000000000000001';
  const user = {
    id: 'cmuser0000000000000000001',
    organizationId: 'cmorganization000000000000001',
  } as User;
  const request = { originalUrl: '/api/assets/upload', query: {} } as Request;

  it('stores an uploaded asset for the caller and returns the canonical asset envelope', async () => {
    const { assets, controller, logs } = buildController();
    const file = {
      buffer: Buffer.from('file'),
      mimetype: 'image/png',
      originalname: 'logo.png',
      size: 1024,
    } as Express.Multer.File;

    const response = await controller.createUpload(request, user, file, {
      category: AssetCategory.LOGO,
      parentId: parentBrandId,
      parentType: AssetParent.BRAND,
    });

    expect(response).toEqual({ data: assets[0], serializer: AssetSerializer });
    expect(assets).toEqual([
      {
        category: AssetCategory.LOGO,
        id: 'asset-1',
        organizationId: user.organizationId,
        parentId: parentBrandId,
        parentType: AssetParent.BRAND,
        uploadedFileName: 'logo.png',
      },
    ]);
    expect(logs).toContainEqual({
      context: expect.objectContaining({
        operation: 'createUpload',
        service: 'AssetsIngestionController',
      }),
      message: 'AssetsIngestionController.createUpload started',
    });
  });

  it('stores an asset from an ingredient and returns the canonical asset envelope', async () => {
    const { assets, controller } = buildController();

    const response = await controller.createFromIngredient(request, user, {
      category: AssetCategory.LOGO,
      ingredientId: 'cmingredient000000000000001',
      parentId: parentBrandId,
    });

    expect(response).toEqual({ data: assets[0], serializer: AssetSerializer });
    expect(assets[0]).toMatchObject({
      organizationId: user.organizationId,
      sourceIngredientId: 'cmingredient000000000000001',
    });
  });
});
