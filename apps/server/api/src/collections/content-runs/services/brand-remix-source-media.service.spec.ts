import type {
  ResolvedSource,
  ResolvedSourceMedia,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
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

const source: ResolvedSource & { sourceMedia: ResolvedSourceMedia } = {
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
    importPolicy: 'permitted',
    importPermissionRef: 'permission-1',
    existingAssetIds: [],
    imageUrls: ['https://cdn.example/still.jpg?exp=1'],
    videoUrls: ['https://cdn.example/ad.mp4?token=keep-me'],
  },
};

describe('BrandRemixSourceMediaService', () => {
  const ingredient = { findFirst: vi.fn(), updateMany: vi.fn() };
  const prisma = { ingredient } as unknown as PrismaService;
  const files = { uploadToS3: vi.fn() } as unknown as FilesClientService;
  const shared = {
    createMediaDocumentsInternal: vi.fn(),
  } as unknown as SharedService;
  const logger = { error: vi.fn() } as unknown as LoggerService;
  let service: BrandRemixSourceMediaService;

  beforeEach(() => {
    vi.resetAllMocks();
    ingredient.updateMany.mockResolvedValue({ count: 1 });
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
      status: IngredientStatus.PROCESSING,
      userId: 'user-1',
    });
    expect(created).not.toHaveProperty('generationSource');
    expect(files.uploadToS3).toHaveBeenCalledWith('ing-1', 'videos', {
      type: FileInputType.URL,
      url: 'https://cdn.example/ad.mp4?token=keep-me',
    });
    expect(ingredient.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        brandId: 'brand-1',
        id: 'ing-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      data: { status: IngredientStatus.UPLOADED },
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

    expect(result).toEqual({ status: 'unavailable', reason: 'copy_failed' });
    expect(ingredient.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        brandId: 'brand-1',
        id: 'ing-1',
        isDeleted: false,
        status: IngredientStatus.PROCESSING,
      },
      data: { status: IngredientStatus.FAILED },
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it.each([
    [{ importPolicy: undefined }, 'import_not_permitted'],
    [{ importPolicy: 'unknown' }, 'import_not_permitted'],
    [{ importPolicy: 'embed_only' }, 'embed_only'],
    [{ importPermissionRef: '' }, 'import_not_permitted'],
    [
      { importPermissionRef: 'https://cdn.example/permission' },
      'import_not_permitted',
    ],
    [{ importExpiresAt: '2000-01-01T00:00:00.000Z' }, 'expired'],
    [{ importExpiresAt: 'invalid' }, 'expired'],
    [{ importExpiresAt: '2999-01-01' }, 'expired'],
  ] as const)(
    'checks current eligibility before even a ready cache lookup: %j',
    async (overrides, reason) => {
      ingredient.findFirst.mockResolvedValue({
        id: 'cached',
        category: IngredientCategory.VIDEO,
      });
      const result = await service.ingest({
        organizationId: 'org-1',
        brandId: 'brand-1',
        userId: 'user-1',
        source: {
          ...source,
          sourceMedia: { ...source.sourceMedia, ...overrides },
        },
      });
      expect(result).toEqual({ status: 'unavailable', reason });
      expect(ingredient.findFirst).not.toHaveBeenCalled();
      expect(shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
      expect(files.uploadToS3).not.toHaveBeenCalled();
    },
  );

  it.each([
    IngredientCategory.IMAGE,
    IngredientCategory.VIDEO,
    IngredientCategory.AVATAR,
  ])('accepts authorized owned %s assets', async (category) => {
    ingredient.findFirst.mockResolvedValue({ id: 'owned-1', category });
    const result = await service.ingest({
      organizationId: 'org-1',
      brandId: 'brand-1',
      userId: 'user-1',
      source: {
        ...source,
        snapshot: {
          ...source.snapshot,
          selector: { kind: 'owned_post', postId: 'post-1' },
        },
        sourceMedia: {
          ...source.sourceMedia,
          importPolicy: 'unknown',
          existingAssetIds: ['owned-1'],
        },
      },
    });
    expect(result).toEqual({
      status: 'saved',
      assetId: 'owned-1',
      category:
        category === IngredientCategory.IMAGE
          ? IngredientCategory.IMAGE
          : IngredientCategory.VIDEO,
    });
    expect(ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          brandId: 'brand-1',
          id: 'owned-1',
          isDeleted: false,
          status: {
            in: [
              IngredientStatus.GENERATED,
              IngredientStatus.UPLOADED,
              IngredientStatus.VALIDATED,
            ],
          },
        },
      }),
    );
    expect(files.uploadToS3).not.toHaveBeenCalled();
  });

  it.each([null, { id: 'owned-1', category: IngredientCategory.AUDIO }])(
    'rejects unavailable or unsupported owned assets without URL fallback',
    async (asset) => {
      ingredient.findFirst.mockResolvedValue(asset);
      const result = await service.ingest({
        organizationId: 'org-1',
        brandId: 'brand-1',
        userId: 'user-1',
        source: {
          ...source,
          snapshot: {
            ...source.snapshot,
            selector: { kind: 'owned_post', postId: 'post-1' },
          },
          sourceMedia: {
            ...source.sourceMedia,
            existingAssetIds: ['owned-1'],
          },
        },
      });
      expect(result).toEqual({
        status: 'unavailable',
        reason: 'invalid_asset',
      });
      expect(ingredient.findFirst).toHaveBeenCalledTimes(1);
      expect(shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
      expect(files.uploadToS3).not.toHaveBeenCalled();
    },
  );

  it('rejects existing IDs supplied by a non-owned source before database access', async () => {
    const result = await service.ingest({
      organizationId: 'org-1',
      brandId: 'brand-1',
      userId: 'user-1',
      source: {
        ...source,
        sourceMedia: { ...source.sourceMedia, existingAssetIds: ['owned-1'] },
      },
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'invalid_asset' });
    expect(ingredient.findFirst).not.toHaveBeenCalled();
    expect(files.uploadToS3).not.toHaveBeenCalled();
  });

  it('accepts a future permission expiry and only searches ready cache records', async () => {
    ingredient.findFirst.mockResolvedValue({
      id: 'cached',
      category: IngredientCategory.IMAGE,
    });
    const result = await service.ingest({
      organizationId: 'org-1',
      brandId: 'brand-1',
      userId: 'user-1',
      source: {
        ...source,
        sourceMedia: {
          ...source.sourceMedia,
          importExpiresAt: '2999-01-01T00:00:00.000Z',
        },
      },
    });
    expect(result.status).toBe('saved');
    expect(ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          brandId: 'brand-1',
          isDeleted: false,
          category: {
            in: [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
          },
          status: {
            in: [
              IngredientStatus.GENERATED,
              IngredientStatus.UPLOADED,
              IngredientStatus.VALIDATED,
            ],
          },
        }),
      }),
    );
  });

  it('rejects invalid remote media before looking up cached ingredients', async () => {
    const result = await service.ingest({
      organizationId: 'org-1',
      brandId: 'brand-1',
      userId: 'user-1',
      source: {
        ...source,
        sourceMedia: {
          ...source.sourceMedia,
          videoUrls: ['file:///private/video.mp4'],
          imageUrls: [],
        },
      },
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'invalid_asset' });
    expect(ingredient.findFirst).not.toHaveBeenCalled();
    expect(files.uploadToS3).not.toHaveBeenCalled();
  });

  it('does not report saved when the scoped upload completion transition fails', async () => {
    ingredient.findFirst.mockResolvedValue(null);
    (
      shared.createMediaDocumentsInternal as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ ingredientData: { id: 'ing-1' } });
    (files.uploadToS3 as ReturnType<typeof vi.fn>).mockResolvedValue({
      size: 12,
    });
    ingredient.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await service.ingest({
      organizationId: 'org-1',
      brandId: 'brand-1',
      userId: 'user-1',
      source,
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'copy_failed' });
    expect(ingredient.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: IngredientStatus.FAILED } }),
    );
  });
});
