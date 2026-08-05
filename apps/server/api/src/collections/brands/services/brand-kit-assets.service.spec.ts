import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BrandKitAssetsService.resolveBrandKitAssets', () => {
  let findFirst: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;
  let service: BrandKitAssetsService;

  beforeEach(() => {
    findFirst = vi.fn().mockResolvedValue(null);
    findMany = vi.fn().mockResolvedValue([]);
    service = new BrandKitAssetsService(
      { asset: { findFirst, findMany } } as unknown as PrismaService,
      {} as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
      { cdnUrl: 'https://cdn.example.com' } as unknown as ConfigService,
    );
  });

  it('scopes the read to the brand, the organization and live assets', async () => {
    await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);

    for (const query of [...findFirst.mock.calls, ...findMany.mock.calls]) {
      expect(query[0]).toEqual(
        expect.objectContaining({
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          where: expect.objectContaining({
            isDeleted: false,
            parentBrandId: 'brand-1',
            parentOrgId: 'org-1',
            parentType: 'BRAND',
          }),
        }),
      );
    }

    expect(findFirst.mock.calls.map(([query]) => query.where.category)).toEqual(
      ['LOGO', 'BANNER'],
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        where: expect.objectContaining({ category: 'REFERENCE' }),
      }),
    );
  });

  it.each([
    ['', '/logos/asset-logo'],
    ['https://cdn.example.com', 'https://cdn.example.com/logos/asset-logo'],
    ['https://cdn.example.com/', 'https://cdn.example.com/logos/asset-logo'],
  ])('normalizes the CDN base %j', async (cdnUrl, expectedUrl) => {
    findFirst.mockResolvedValueOnce({
      category: 'LOGO',
      cloudObjectKey: '/logos/asset-logo',
      displayName: 'Wordmark',
      id: 'asset-logo',
      mimeType: 'image/png',
      parentBrandId: 'brand-1',
    });
    service = new BrandKitAssetsService(
      { asset: { findFirst, findMany } } as unknown as PrismaService,
      {} as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
      { cdnUrl } as unknown as ConfigService,
    );

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo?.url).toBe(expectedUrl);
  });

  it('falls back to the canonical key shape when no object key was recorded', async () => {
    findFirst.mockResolvedValueOnce({
      category: 'LOGO',
      cloudObjectKey: null,
      displayName: null,
      id: 'asset-logo',
      mimeType: null,
      parentBrandId: 'brand-1',
    });

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo?.url).toBe('https://cdn.example.com/logos/asset-logo');
    expect(assets.logo?.mimeType).toBeUndefined();
  });

  it('selects the newest logo and banner deterministically', async () => {
    findFirst
      .mockResolvedValueOnce({
        category: 'LOGO',
        cloudObjectKey: 'logos/newest-logo',
        displayName: null,
        id: 'newest-logo',
        mimeType: null,
        parentBrandId: 'brand-1',
      })
      .mockResolvedValueOnce({
        category: 'BANNER',
        cloudObjectKey: 'banners/newest-banner',
        displayName: null,
        id: 'newest-banner',
        mimeType: null,
        parentBrandId: 'brand-1',
      });

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo?.id).toBe('newest-logo');
    expect(assets.banner?.id).toBe('newest-banner');
    expect(findFirst.mock.calls.map(([query]) => query.orderBy)).toEqual([
      [{ updatedAt: 'desc' }, { id: 'asc' }],
      [{ updatedAt: 'desc' }, { id: 'asc' }],
    ]);
  });

  it('keeps the newest ten references in deterministic order', async () => {
    findMany.mockImplementation(({ take }) =>
      Promise.resolve(
        Array.from({ length: 12 }, (_, index) => ({
          category: 'REFERENCE',
          cloudObjectKey: `references/ref-${index + 1}`,
          displayName: null,
          id: `ref-${index + 1}`,
          mimeType: null,
          parentBrandId: 'brand-1',
        })).slice(0, take),
      ),
    );

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: 10,
      }),
    );
    expect(assets.references).toHaveLength(10);
    expect(assets.references.map((reference) => reference.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `ref-${index + 1}`),
    );
  });

  it('returns an empty kit when the brand has no assets', async () => {
    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets).toEqual({ references: [] });
  });
});

describe('BrandKitAssetsService.resolveBrandKitAssetsForBrands', () => {
  let findFirst: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;
  let service: BrandKitAssetsService;

  beforeEach(() => {
    findFirst = vi.fn().mockResolvedValue(null);
    findMany = vi.fn().mockResolvedValue([]);
    service = new BrandKitAssetsService(
      { asset: { findFirst, findMany } } as unknown as PrismaService,
      {} as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
      { cdnUrl: 'https://cdn.example.com' } as unknown as ConfigService,
    );
  });

  it('bounds each role read for every requested brand', async () => {
    await service.resolveBrandKitAssetsForBrands(
      ['brand-1', 'brand-2', 'brand-1'],
      'org-1',
    );

    expect(findFirst).toHaveBeenCalledTimes(4);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls.map(([query]) => query.take)).toEqual([10, 10]);
    expect(
      [...findFirst.mock.calls, ...findMany.mock.calls].map(
        ([query]) => query.where,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'LOGO',
          isDeleted: false,
          parentBrandId: 'brand-1',
          parentOrgId: 'org-1',
          parentType: 'BRAND',
        }),
        expect.objectContaining({
          category: 'BANNER',
          isDeleted: false,
          parentBrandId: 'brand-2',
          parentOrgId: 'org-1',
          parentType: 'BRAND',
        }),
        expect.objectContaining({
          category: 'REFERENCE',
          isDeleted: false,
          parentBrandId: 'brand-2',
          parentOrgId: 'org-1',
          parentType: 'BRAND',
        }),
      ]),
    );
  });

  it('routes each asset to its own brand', async () => {
    findFirst
      .mockResolvedValueOnce({
        category: 'LOGO',
        cloudObjectKey: 'logos/logo-1',
        displayName: null,
        id: 'logo-1',
        mimeType: null,
        parentBrandId: 'brand-1',
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        category: 'LOGO',
        cloudObjectKey: 'logos/logo-2',
        displayName: null,
        id: 'logo-2',
        mimeType: null,
        parentBrandId: 'brand-2',
      })
      .mockResolvedValueOnce(null);
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        category: 'REFERENCE',
        cloudObjectKey: 'references/ref-1',
        displayName: null,
        id: 'ref-1',
        mimeType: null,
        parentBrandId: 'brand-2',
      },
    ]);

    const resolved = await service.resolveBrandKitAssetsForBrands(
      ['brand-1', 'brand-2'],
      'org-1',
    );

    expect(resolved.get('brand-1')?.logo?.id).toBe('logo-1');
    expect(resolved.get('brand-1')?.references).toEqual([]);
    expect(resolved.get('brand-2')?.logo?.id).toBe('logo-2');
    expect(resolved.get('brand-2')?.references.map((r) => r.id)).toEqual([
      'ref-1',
    ]);
  });

  it('yields an empty kit for a brand that owns no assets', async () => {
    const resolved = await service.resolveBrandKitAssetsForBrands(
      ['brand-1'],
      'org-1',
    );

    expect(resolved.get('brand-1')).toEqual({ references: [] });
  });

  it('skips the read entirely when there are no brands', async () => {
    const resolved = await service.resolveBrandKitAssetsForBrands([], 'org-1');

    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(resolved.size).toBe(0);
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

  it('reads every brand in a single tenant-scoped query', async () => {
    await service.resolveBrandLogoUrls(
      new Map([
        ['org-1', ['brand-1', 'brand-2']],
        ['org-2', ['brand-3']],
      ]),
    );

    expect(findMany).toHaveBeenCalledTimes(1);
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

  it('keys the newest absolute CDN URL by brand id', async () => {
    findMany.mockResolvedValue([
      {
        cloudObjectKey: 'logos/newest',
        id: 'newest',
        parentBrandId: 'brand-1',
      },
      {
        cloudObjectKey: 'logos/older',
        id: 'older',
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

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
    );
    expect(urls.get('brand-1')).toBe('https://cdn.example.com/logos/newest');
    expect(urls.get('brand-2')).toBe('https://cdn.example.com/logos/asset-b');
  });

  it('falls back to the canonical key and skips an empty request', async () => {
    findMany.mockResolvedValue([
      { cloudObjectKey: null, id: 'asset-a', parentBrandId: 'brand-1' },
    ]);

    const urls = await service.resolveBrandLogoUrls(
      new Map([['org-1', ['brand-1']]]),
    );
    expect(urls.get('brand-1')).toBe('https://cdn.example.com/logos/asset-a');

    findMany.mockClear();
    const empty = await service.resolveBrandLogoUrls(
      new Map([
        ['org-1', []],
        ['', ['brand-1']],
      ]),
    );
    expect(findMany).not.toHaveBeenCalled();
    expect(empty.size).toBe(0);
  });
});
