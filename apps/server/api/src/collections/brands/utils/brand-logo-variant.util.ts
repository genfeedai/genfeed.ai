import { ASSET_ORIGIN_GENERATION_PENDING } from '@api/collections/assets/constants/asset-origin.constant';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetCategory, AssetParent, BrandKitSlot } from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';

/**
 * The live asset id of one logo variant, or null when the brand has none.
 * Scoped to the brand's organization like every brand kit read.
 */
export const findBrandLogoVariantId = traced(
  'findBrandLogoVariantId',
  async (
    prisma: Pick<PrismaService, 'asset'>,
    brandId: string,
    organizationId: string,
    slot: BrandKitSlot,
  ): Promise<string | null> => {
    const asset = await prisma.asset.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
      where: {
        category: AssetCategory.LOGO,
        isDeleted: false,
        kitSlot: slot,
        // A variant still generating has no image yet.
        OR: [
          { origin: null },
          { origin: { not: ASSET_ORIGIN_GENERATION_PENDING } },
        ],
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: AssetParent.BRAND,
      },
    });
    return asset?.id ?? null;
  },
);

/** The light-background variant a watermark on light footage prefers. */
export function findLightBackgroundLogoId(
  prisma: Pick<PrismaService, 'asset'>,
  brandId: string,
  organizationId: string,
): Promise<string | null> {
  return findBrandLogoVariantId(
    prisma,
    brandId,
    organizationId,
    BrandKitSlot.LOGO_LIGHT,
  );
}
