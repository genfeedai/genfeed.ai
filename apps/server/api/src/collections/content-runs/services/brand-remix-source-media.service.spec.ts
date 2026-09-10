import type { ResolvedSource } from '@api/collections/content-runs/services/brand-remix-runs.types';
import { BrandRemixSourceMediaService } from '@api/collections/content-runs/services/brand-remix-source-media.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { BrandRemixAdPlatform } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source: ResolvedSource = {
  recommendedOutputKind: 'video',
  snapshot: {
    capturedAt: '2026-09-10T12:00:00.000Z',
    evidence: [],
    metrics: {},
    pattern: {},
    platform: BrandRemixAdPlatform.TIKTOK,
    selector: { kind: 'saved_ad', savedAdId: 'saved-ad-1' },
    sourceId: 'saved-ad-1',
    title: 'Winning ad',
  },
  sourceMedia: {
    existingAssetIds: [],
    imageUrls: ['https://cdn.example/still.jpg?exp=1'],
    videoUrls: ['https://cdn.example/ad.mp4?token=keep-me'],
  },
};

describe('BrandRemixSourceMediaService', () => {
  const ingredient = { findFirst: vi.fn() };
  const prisma = { ingredient } as unknown as PrismaService;
  const files = { uploadToS3: vi.fn() } as unknown as FilesClientService;
  const shared = {
    createMediaDocumentsInternal: vi.fn(),
  } as unknown as SharedService;
  const logger = { error: vi.fn() } as unknown as LoggerService;
  let service: BrandRemixSourceMediaService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new BrandRemixSourceMediaService(prisma, files, shared, logger);
  });

  it('skips ingest when the source has no downloadable media', async () => {
    const result = await service.ingest({
      brandId: 'brand-1',
      organizationId: 'org-1',
      source: {
        ...source,
        sourceMedia: { existingAssetIds: [], imageUrls: [], videoUrls: [] },
      },
      userId: 'user-1',
    });

    expect(result).toEqual({ status: 'skipped' });
    expect(shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
    expect(files.uploadToS3).not.toHaveBeenCalled();
  });

  it('reuses a ready ingredient for the same remix source', async () => {
    ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.VIDEO,
      id: 'existing-1',
    });

    const result = await service.ingest({
      brandId: 'brand-1',
      organizationId: 'org-1',
      source,
      userId: 'user-1',
    });

    expect(result).toEqual({
      assetId: 'existing-1',
      category: IngredientCategory.VIDEO,
      status: 'saved',
    });
    expect(shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
  });

  it('uploads source video bytes through Files and returns the Library ingredient', async () => {
    ingredient.findFirst.mockResolvedValue(null);
    (
      shared.createMediaDocumentsInternal as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ingredientData: { id: 'ing-1' },
    });
    (files.uploadToS3 as ReturnType<typeof vi.fn>).mockResolvedValue({
      size: 12,
    });

    const result = await service.ingest({
      brandId: 'brand-1',
      organizationId: 'org-1',
      source,
      userId: 'user-1',
    });

    const created = (
      shared.createMediaDocumentsInternal as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(created).toMatchObject({
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      organizationId: 'org-1',
      scope: 'USER',
      sourceActionId: 'remix-source:brand-1:saved_ad:saved-ad-1',
      status: IngredientStatus.UPLOADED,
      userId: 'user-1',
    });
    expect(created).not.toHaveProperty('generationSource');
    expect(files.uploadToS3).toHaveBeenCalledWith('ing-1', 'videos', {
      type: FileInputType.URL,
      url: 'https://cdn.example/ad.mp4?token=keep-me',
    });
    expect(result).toEqual({
      assetId: 'ing-1',
      category: IngredientCategory.VIDEO,
      status: 'saved',
    });
  });

  it('returns unavailable when the Files copy fails', async () => {
    ingredient.findFirst.mockResolvedValue(null);
    (
      shared.createMediaDocumentsInternal as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ingredientData: { id: 'ing-1' },
    });
    (files.uploadToS3 as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('cdn gone'),
    );

    const result = await service.ingest({
      brandId: 'brand-1',
      organizationId: 'org-1',
      source,
      userId: 'user-1',
    });

    expect(result).toEqual({ status: 'unavailable' });
    expect(logger.error).toHaveBeenCalled();
  });
});
