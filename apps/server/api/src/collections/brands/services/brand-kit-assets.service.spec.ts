import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BrandKitAssetsService.resolveBrandKitAssets', () => {
  let findMany: ReturnType<typeof vi.fn>;
  let service: BrandKitAssetsService;

  beforeEach(() => {
    findMany = vi.fn().mockResolvedValue([]);
    service = new BrandKitAssetsService(
      { asset: { findMany } } as unknown as PrismaService,
      {} as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
      { cdnUrl: 'https://cdn.example.com' } as unknown as ConfigService,
    );
  });

  it('scopes the read to the brand, the organization and live assets', async () => {
    await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          parentBrandId: 'brand-1',
          parentOrgId: 'org-1',
          parentType: 'BRAND',
        }),
      }),
    );
  });

  it('builds absolute CDN urls from the stored object key', async () => {
    findMany.mockResolvedValue([
      {
        category: 'LOGO',
        cloudObjectKey: 'logos/asset-logo',
        displayName: 'Wordmark',
        id: 'asset-logo',
        mimeType: 'image/png',
      },
      {
        category: 'BANNER',
        cloudObjectKey: 'banners/asset-banner',
        displayName: null,
        id: 'asset-banner',
        mimeType: 'image/jpeg',
      },
    ]);

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo).toEqual({
      id: 'asset-logo',
      label: 'Wordmark',
      mimeType: 'image/png',
      role: 'logo',
      url: 'https://cdn.example.com/logos/asset-logo',
    });
    expect(assets.banner?.url).toBe(
      'https://cdn.example.com/banners/asset-banner',
    );
    expect(assets.references).toEqual([]);
  });

  it('falls back to the canonical key shape when no object key was recorded', async () => {
    findMany.mockResolvedValue([
      {
        category: 'LOGO',
        cloudObjectKey: null,
        displayName: null,
        id: 'asset-logo',
        mimeType: null,
      },
    ]);

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo?.url).toBe('https://cdn.example.com/logos/asset-logo');
    expect(assets.logo?.mimeType).toBeUndefined();
  });

  it('keeps the most recent logo and collects every reference', async () => {
    findMany.mockResolvedValue([
      {
        category: 'LOGO',
        cloudObjectKey: 'logos/newest',
        displayName: null,
        id: 'newest',
        mimeType: null,
      },
      {
        category: 'LOGO',
        cloudObjectKey: 'logos/older',
        displayName: null,
        id: 'older',
        mimeType: null,
      },
      {
        category: 'REFERENCE',
        cloudObjectKey: 'references/ref-1',
        displayName: 'Hero',
        id: 'ref-1',
        mimeType: null,
      },
      {
        category: 'REFERENCE',
        cloudObjectKey: 'references/ref-2',
        displayName: null,
        id: 'ref-2',
        mimeType: null,
      },
    ]);

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
    );
    expect(assets.logo?.id).toBe('newest');
    expect(assets.references.map((reference) => reference.id)).toEqual([
      'ref-1',
      'ref-2',
    ]);
  });

  it('returns an empty kit when the brand has no assets', async () => {
    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets).toEqual({ references: [] });
  });
});
