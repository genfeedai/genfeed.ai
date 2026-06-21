import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ConfigService } from '@api/config/config.service';
import { DarkroomAssetService } from '@api/endpoints/admin/darkroom/services/darkroom-asset.service';
import { DarkroomTrainingService } from '@api/endpoints/admin/darkroom/services/darkroom-training.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { DarkroomReviewStatus, IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DarkroomAssetService.reviewAsset', () => {
  let service: DarkroomAssetService;
  let ingredientsService: Record<string, ReturnType<typeof vi.fn>>;
  let filesClientService: Record<string, ReturnType<typeof vi.fn>>;
  let darkroomTrainingService: Record<string, ReturnType<typeof vi.fn>>;

  const imageAsset = {
    _id: { toString: () => 'asset-1' },
    category: IngredientCategory.IMAGE,
    cdnUrl: 'https://cdn/asset-1.jpg',
    generationPrompt: 'a portrait',
    personaSlug: 'alice',
    reviewStatus: DarkroomReviewStatus.PENDING,
  };

  beforeEach(async () => {
    ingredientsService = {
      findAllByOrganization: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn().mockResolvedValue({ ...imageAsset }),
    };
    filesClientService = { uploadToS3: vi.fn().mockResolvedValue(undefined) };
    darkroomTrainingService = {
      syncDataset: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DarkroomAssetService,
        { provide: IngredientsService, useValue: ingredientsService },
        { provide: FilesClientService, useValue: filesClientService },
        {
          provide: DarkroomTrainingService,
          useValue: darkroomTrainingService,
        },
        { provide: ConfigService, useValue: { get: () => 'darkroom-bucket' } },
        { provide: LoggerService, useValue: { log: vi.fn() } },
      ],
    }).compile();

    service = module.get(DarkroomAssetService);
  });

  it('throws NotFound when the asset is not in the organization (multi-tenant guard)', async () => {
    ingredientsService.findOne.mockResolvedValue(null);

    await expect(
      service.reviewAsset('asset-1', 'org-1', DarkroomReviewStatus.APPROVED),
    ).rejects.toThrow(NotFoundException);
    expect(ingredientsService.patch).not.toHaveBeenCalled();
  });

  it('syncs a freshly-approved IMAGE asset into the training dataset', async () => {
    ingredientsService.findOne.mockResolvedValue(imageAsset);

    await service.reviewAsset(
      'asset-1',
      'org-1',
      DarkroomReviewStatus.APPROVED,
    );

    expect(ingredientsService.patch).toHaveBeenCalledWith('asset-1', {
      reviewStatus: DarkroomReviewStatus.APPROVED,
    });
    // image + caption uploads, then the dataset sync.
    expect(filesClientService.uploadToS3).toHaveBeenCalled();
    expect(darkroomTrainingService.syncDataset).toHaveBeenCalledWith(
      'alice',
      expect.any(Array),
      'darkroom-bucket',
    );
  });

  it('does not sync a non-IMAGE asset on approval', async () => {
    ingredientsService.findOne.mockResolvedValue({
      ...imageAsset,
      category: IngredientCategory.VIDEO,
    });

    await service.reviewAsset(
      'asset-1',
      'org-1',
      DarkroomReviewStatus.APPROVED,
    );

    expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
    expect(darkroomTrainingService.syncDataset).not.toHaveBeenCalled();
  });

  it('does not sync on rejection', async () => {
    ingredientsService.findOne.mockResolvedValue(imageAsset);

    await service.reviewAsset(
      'asset-1',
      'org-1',
      DarkroomReviewStatus.REJECTED,
    );

    expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
  });
});
