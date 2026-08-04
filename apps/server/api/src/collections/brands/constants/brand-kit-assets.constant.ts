import type { BrandKitAssetRole } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Brand kit asset roles and their storage encoding.
 *
 * A brand's logo, banner and reference images are `Asset` rows discriminated by
 * `category` — the Brand table has no logo/banner column. These maps are the one
 * place that translation lives, so the resolver, the importer and the serializer
 * payload mapper can never drift into disagreeing about what "logo" means.
 */
export const PRISMA_ASSET_CATEGORY_BY_ROLE: Record<
  BrandKitAssetRole,
  Prisma.AssetCreateInput['category']
> = {
  banner: 'BANNER' as Prisma.AssetCreateInput['category'],
  logo: 'LOGO' as Prisma.AssetCreateInput['category'],
  reference: 'REFERENCE' as Prisma.AssetCreateInput['category'],
};

export const ASSET_UPLOAD_TYPE_BY_ROLE: Record<BrandKitAssetRole, string> = {
  banner: 'banners',
  logo: 'logos',
  reference: 'references',
};

export const BRAND_KIT_ROLE_BY_PRISMA_CATEGORY = new Map<
  string,
  BrandKitAssetRole
>(
  Object.entries(PRISMA_ASSET_CATEGORY_BY_ROLE).map(([role, category]) => [
    String(category),
    role as BrandKitAssetRole,
  ]),
);

// A brand keeps one live logo and one live banner; references are unbounded, so
// the read is capped to keep an agent prompt from swallowing an entire library.
export const BRAND_KIT_RESOLVED_REFERENCE_LIMIT = 10;
