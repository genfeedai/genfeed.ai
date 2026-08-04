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

describe('BrandKitAssetsService.resolveBrandLogoUrls', () => {
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

  it('reads every brand in a single query rather than one per brand', async () => {
    await service.resolveBrandLogoUrls(
      new Map([['org-1', ['brand-1', 'brand-2', 'brand-3']]]),
    );

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('scopes each organization group to its own brands so a page cannot read across tenants', async () => {
    await service.resolveBrandLogoUrls(
      new Map([
        ['org-1', ['brand-1', 'brand-2']],
        ['org-2', ['brand-3']],
      ]),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'LOGO',
          isDeleted: false,
          OR: [
            {
              parentBrandId: { in: ['brand-1', 'brand-2'] },
              parentOrgId: 'org-1',
            },
            { parentBrandId: { in: ['brand-3'] }, parentOrgId: 'org-2' },
          ],
          parentType: 'BRAND',
        }),
      }),
    );
  });

  it('keys absolute CDN urls by brand id', async () => {
    findMany.mockResolvedValue([
      {
        cloudObjectKey: 'logos/asset-a',
        id: 'asset-a',
        parentBrandId: 'brand-1',
      },
      {
        cloudObjectKey: 'logos/asset-b',
        id: 'asset-b',
        parentBrandId: 'brand-2',
      },
    ]);

    const urls = await service.resolveBrandLogoUrls(
      new Map([['org-1', ['brand-1', 'brand-2']]]),
    );

    expect(urls.get('brand-1')).toBe('https://cdn.example.com/logos/asset-a');
    expect(urls.get('brand-2')).toBe('https://cdn.example.com/logos/asset-b');
  });

  it('keeps the most recent logo per brand, matching the single-brand resolver', async () => {
    findMany.mockResolvedValue([
      {
        cloudObjectKey: 'logos/newest',
        id: 'newest',
        parentBrandId: 'brand-1',
      },
      { cloudObjectKey: 'logos/older', id: 'older', parentBrandId: 'brand-1' },
    ]);

    const urls = await service.resolveBrandLogoUrls(
      new Map([['org-1', ['brand-1']]]),
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
    );
    expect(urls.get('brand-1')).toBe('https://cdn.example.com/logos/newest');
  });

  it('falls back to the canonical key shape when no object key was recorded', async () => {
    findMany.mockResolvedValue([
      { cloudObjectKey: null, id: 'asset-a', parentBrandId: 'brand-1' },
    ]);

    const urls = await service.resolveBrandLogoUrls(
      new Map([['org-1', ['brand-1']]]),
    );

    expect(urls.get('brand-1')).toBe('https://cdn.example.com/logos/asset-a');
  });

  it('omits brands that have no live logo asset', async () => {
    findMany.mockResolvedValue([
      {
        cloudObjectKey: 'logos/asset-a',
        id: 'asset-a',
        parentBrandId: 'brand-1',
      },
    ]);

    const urls = await service.resolveBrandLogoUrls(
      new Map([['org-1', ['brand-1', 'brand-2']]]),
    );

    expect(urls.has('brand-2')).toBe(false);
  });

  it('skips the query entirely when no organization contributes a brand', async () => {
    const urls = await service.resolveBrandLogoUrls(
      new Map([
        ['org-1', []],
        ['', ['brand-1']],
      ]),
    );

    expect(findMany).not.toHaveBeenCalled();
    expect(urls.size).toBe(0);
  });
});
