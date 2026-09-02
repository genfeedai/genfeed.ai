import { BRAND_KIT_RESOLVED_REFERENCE_LIMIT } from '@api/collections/brands/constants/brand-kit-assets.constant';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RankedAssetRow = {
  category: string;
  cloudObjectKey: string | null;
  displayName: string | null;
  id: string;
  mimeType: string | null;
  parentBrandId: string | null;
  referenceCategory: string | null;
};

/** The interpolated SQL, flattened so a test can assert on its shape. */
function readSql(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join(' ? ');
}

function readBindings(call: unknown[]): unknown[] {
  return call.slice(1);
}

function rankedRow(overrides: Partial<RankedAssetRow>): RankedAssetRow {
  return {
    category: 'LOGO',
    cloudObjectKey: null,
    displayName: null,
    id: 'asset-1',
    mimeType: null,
    parentBrandId: 'brand-1',
    referenceCategory: null,
    ...overrides,
  };
}

describe('BrandKitAssetsService.resolveBrandKitAssets', () => {
  let queryRaw: ReturnType<typeof vi.fn>;
  let service: BrandKitAssetsService;

  beforeEach(() => {
    queryRaw = vi.fn().mockResolvedValue([]);
    service = new BrandKitAssetsService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      {} as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
      { cdnUrl: 'https://cdn.example.com' } as unknown as ConfigService,
    );
  });

  it('scopes the read to the brand, the organization and live assets', async () => {
    await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(queryRaw).toHaveBeenCalledTimes(1);

    const sql = readSql(queryRaw.mock.calls[0]);
    expect(sql).toContain('"isDeleted" = false');
    expect(sql).toContain(`"parentType" = 'BRAND'::"AssetParent"`);
    expect(sql).toContain('"parentOrgId" =');
    expect(sql).toContain('"parentBrandId" = ANY(');
    expect(sql).toContain('"category" = ANY( ? ::"AssetCategory"[])');
    expect(readBindings(queryRaw.mock.calls[0])).toEqual([
      'org-1',
      ['brand-1'],
      ['LOGO', 'BANNER', 'REFERENCE'],
      'REFERENCE',
      BRAND_KIT_RESOLVED_REFERENCE_LIMIT,
    ]);
  });

  it.each([
    ['', '/logos/asset-logo'],
    ['https://cdn.example.com', 'https://cdn.example.com/logos/asset-logo'],
    ['https://cdn.example.com/', 'https://cdn.example.com/logos/asset-logo'],
  ])('normalizes the CDN base %j', async (cdnUrl, expectedUrl) => {
    queryRaw.mockResolvedValueOnce([
      rankedRow({
        cloudObjectKey: '/logos/asset-logo',
        displayName: 'Wordmark',
        id: 'asset-logo',
        mimeType: 'image/png',
      }),
    ]);
    service = new BrandKitAssetsService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      {} as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
      { cdnUrl } as unknown as ConfigService,
    );

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo?.url).toBe(expectedUrl);
  });

  it('falls back to the canonical key shape when no object key was recorded', async () => {
    queryRaw.mockResolvedValueOnce([rankedRow({ id: 'asset-logo' })]);

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo?.url).toBe('https://cdn.example.com/logos/asset-logo');
    expect(assets.logo?.mimeType).toBeUndefined();
  });

  it('selects the newest logo and banner deterministically', async () => {
    queryRaw.mockResolvedValueOnce([
      rankedRow({ cloudObjectKey: 'logos/newest-logo', id: 'newest-logo' }),
      rankedRow({
        category: 'BANNER',
        cloudObjectKey: 'banners/newest-banner',
        id: 'newest-banner',
      }),
    ]);

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.logo?.id).toBe('newest-logo');
    expect(assets.banner?.id).toBe('newest-banner');
    expect(readSql(queryRaw.mock.calls[0])).toContain(
      'ORDER BY asset."updatedAt" DESC, asset."id" ASC',
    );
  });

  it('keeps the configured number of newest references in deterministic order', async () => {
    queryRaw.mockResolvedValueOnce(
      Array.from({ length: BRAND_KIT_RESOLVED_REFERENCE_LIMIT }, (_, index) =>
        rankedRow({
          category: 'REFERENCE',
          cloudObjectKey: `references/ref-${index + 1}`,
          id: `ref-${index + 1}`,
        }),
      ),
    );

    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets.references).toHaveLength(BRAND_KIT_RESOLVED_REFERENCE_LIMIT);
    expect(assets.references.map((reference) => reference.id)).toEqual(
      Array.from(
        { length: BRAND_KIT_RESOLVED_REFERENCE_LIMIT },
        (_, index) => `ref-${index + 1}`,
      ),
    );
  });

  it('returns an empty kit when the brand has no assets', async () => {
    const assets = await service.resolveBrandKitAssets('brand-1', 'org-1');

    expect(assets).toEqual({ references: [] });
  });
});

describe('BrandKitAssetsService.resolveBrandKitAssetsForBrands', () => {
  let queryRaw: ReturnType<typeof vi.fn>;
  let service: BrandKitAssetsService;

  beforeEach(() => {
    queryRaw = vi.fn().mockResolvedValue([]);
    service = new BrandKitAssetsService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      {} as unknown as CacheInvalidationService,
      {} as unknown as FilesClientService,
      { cdnUrl: 'https://cdn.example.com' } as unknown as ConfigService,
    );
  });

  it('resolves every brand in one query instead of one read per brand', async () => {
    await service.resolveBrandKitAssetsForBrands(
      ['brand-1', 'brand-2', 'brand-1'],
      'org-1',
    );

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(readBindings(queryRaw.mock.calls[0])[1]).toEqual([
      'brand-1',
      'brand-2',
    ]);
  });

  it('bounds each role per brand inside the query', async () => {
    await service.resolveBrandKitAssetsForBrands(
      ['brand-1', 'brand-2'],
      'org-1',
    );

    const sql = readSql(queryRaw.mock.calls[0]);
    expect(sql).toContain(
      'PARTITION BY categorized."parentBrandId", categorized."category"',
    );
    expect(sql).toContain(
      'COALESCE(asset."referenceCategory"::text, \'STYLE\')',
    );
    expect(sql).toContain('AND categorized."categoryRank" = 1');
    expect(sql).toContain("WHEN 'FACE' THEN 0");
    expect(sql).toContain("WHEN 'PRODUCT' THEN 1");
    expect(sql).toContain('ROW_NUMBER()');
    expect(sql).toContain('ranked."roleRank" <= CASE');
    // The reference cap is per brand, not a global `take` one brand can starve.
    expect(readBindings(queryRaw.mock.calls[0]).at(-1)).toBe(
      BRAND_KIT_RESOLVED_REFERENCE_LIMIT,
    );
  });

  it('routes each asset to its own brand', async () => {
    queryRaw.mockResolvedValueOnce([
      rankedRow({ cloudObjectKey: 'logos/logo-1', id: 'logo-1' }),
      rankedRow({
        cloudObjectKey: 'logos/logo-2',
        id: 'logo-2',
        parentBrandId: 'brand-2',
      }),
      rankedRow({
        category: 'REFERENCE',
        cloudObjectKey: 'references/ref-1',
        id: 'ref-1',
        parentBrandId: 'brand-2',
        referenceCategory: 'PRODUCT',
      }),
    ]);

    const resolved = await service.resolveBrandKitAssetsForBrands(
      ['brand-1', 'brand-2'],
      'org-1',
    );

    expect(resolved.get('brand-1')?.logo?.id).toBe('logo-1');
    expect(resolved.get('brand-1')?.references).toEqual([]);
    expect(resolved.get('brand-2')?.logo?.id).toBe('logo-2');
    expect(resolved.get('brand-2')?.references).toEqual([
      expect.objectContaining({
        id: 'ref-1',
        referenceCategory: 'PRODUCT',
      }),
    ]);
  });

  it('ignores rows for a brand that was never requested', async () => {
    queryRaw.mockResolvedValueOnce([
      rankedRow({ id: 'logo-foreign', parentBrandId: 'brand-foreign' }),
      rankedRow({ id: 'logo-1' }),
    ]);

    const resolved = await service.resolveBrandKitAssetsForBrands(
      ['brand-1'],
      'org-1',
    );

    expect(resolved.size).toBe(1);
    expect(resolved.get('brand-1')?.logo?.id).toBe('logo-1');
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

    expect(queryRaw).not.toHaveBeenCalled();
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
