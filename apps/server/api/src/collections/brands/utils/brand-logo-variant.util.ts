import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetCategory, AssetParent, BrandKitSlot } from '@genfeedai/contracts';

/**
 * The live asset id of one logo variant, or null when the brand has none.
 * Scoped to the brand's organization like every brand kit read.
 */
export async function findBrandLogoVariantId(
  prisma: Pick<PrismaService, 'asset'>,
  brandId: string,
  organizationId: string,
  slot: BrandKitSlot,
): Promise<string | null> {
  const asset = await prisma.asset.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
    where: {
      category: AssetCategory.LOGO,
      isDeleted: false,
      kitSlot: slot,
      parentBrandId: brandId,
      parentOrgId: organizationId,
      parentType: AssetParent.BRAND,
    },
  });
  return asset?.id ?? null;
}

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
