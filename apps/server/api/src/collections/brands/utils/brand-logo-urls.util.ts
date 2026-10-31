import {
  ASSET_UPLOAD_TYPE_BY_ROLE,
  PRISMA_ASSET_CATEGORY_BY_ROLE,
} from '@api/collections/brands/constants/brand-kit-assets.constant';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Live logo CDN URLs for many brands at once, keyed by brand id. The newest logo
 * wins. Each organization's brand ids are looked up under that organization, so a
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
    select: { cloudObjectKey: true, id: true, parentBrandId: true },
    where: {
      category: PRISMA_ASSET_CATEGORY_BY_ROLE.logo,
      isDeleted: false,
      OR: organizationScopes,
      parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
    },
  });

  const cdnBase = cdnUrl.replace(/\/+$/, '');
  const logoUrlsByBrandId = new Map<string, string>();
  for (const asset of assets) {
    if (!asset.parentBrandId || logoUrlsByBrandId.has(asset.parentBrandId)) {
      continue;
    }
    const objectKey =
      asset.cloudObjectKey?.trim() ||
      `${ASSET_UPLOAD_TYPE_BY_ROLE.logo}/${asset.id}`;
    logoUrlsByBrandId.set(
      asset.parentBrandId,
      `${cdnBase}/${objectKey.replace(/^\/+/, '')}`,
    );
  }

  return logoUrlsByBrandId;
}
