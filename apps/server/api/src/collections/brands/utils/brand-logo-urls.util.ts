import { ASSET_ORIGIN_GENERATION_PENDING } from '@api/collections/assets/constants/asset-origin.constant';
import {
  ASSET_UPLOAD_TYPE_BY_ROLE,
  PRISMA_ASSET_CATEGORY_BY_ROLE,
} from '@api/collections/brands/constants/brand-kit-assets.constant';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BrandKitSlot } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

const TRAILING_SLASHES_PATTERN = /\/+$/;
const LEADING_SLASHES_PATTERN = /^\/+/;

/**
 * Live logo CDN URLs for many brands at once, keyed by brand id. The newest
 * primary logo wins (a logo without a variant is the primary one); a brand with
 * only other variants falls back to its newest logo. Each organization's brand ids are looked up under that organization, so a
 * brand id from another tenant never resolves.
 */
export async function resolveBrandLogoCdnUrls(
  prisma: PrismaService,
  cdnUrl: string,
  brandIdsByOrganization: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, string>> {
  const organizationScopes = [...brandIdsByOrganization.entries()]
    .filter(
      ([organizationId, brandIds]) =>
        organizationId.length > 0 && brandIds.length > 0,
    )
    .map(([organizationId, brandIds]) => ({
      parentBrandId: { in: [...brandIds] },
      parentOrgId: organizationId,
    }));

  if (organizationScopes.length === 0) {
    return new Map();
  }

  const assets = await prisma.asset.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      cloudObjectKey: true,
      id: true,
      kitSlot: true,
      parentBrandId: true,
    },
    where: {
      // A logo still generating has no image yet.
      AND: [
        {
          OR: [
            { origin: null },
            { origin: { not: ASSET_ORIGIN_GENERATION_PENDING } },
          ],
        },
      ],
      category: PRISMA_ASSET_CATEGORY_BY_ROLE.logo,
      isDeleted: false,
      OR: organizationScopes,
      parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
    },
  });

  const cdnBase = cdnUrl.replace(TRAILING_SLASHES_PATTERN, '');
  const logoUrlsByBrandId = new Map<string, string>();
  const isPrimary = (asset: (typeof assets)[number]) =>
    asset.kitSlot === null || asset.kitSlot === BrandKitSlot.LOGO_PRIMARY;
  const ranked = [
    ...assets.filter(isPrimary),
    ...assets.filter((asset) => !isPrimary(asset)),
  ];
  for (const asset of ranked) {
    if (!asset.parentBrandId || logoUrlsByBrandId.has(asset.parentBrandId)) {
      continue;
    }
    const objectKey =
      asset.cloudObjectKey?.trim() ||
      `${ASSET_UPLOAD_TYPE_BY_ROLE.logo}/${asset.id}`;
    logoUrlsByBrandId.set(
      asset.parentBrandId,
      `${cdnBase}/${objectKey.replace(LEADING_SLASHES_PATTERN, '')}`,
    );
  }

  return logoUrlsByBrandId;
}
