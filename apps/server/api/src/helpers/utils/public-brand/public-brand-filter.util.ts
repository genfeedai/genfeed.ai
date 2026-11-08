import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { AssetScope } from '@genfeedai/contracts';

/**
 * Content is public on genfeed.ai only while its brand is: a private brand's
 * posts, images, videos and articles stay off the site, so a brand id cannot
 * be used to list the content of a profile that is not public. The relation
 * filter is not enum-normalized by BaseService, so the scope is the Prisma
 * label.
 */
export const PUBLIC_BRAND_WHERE = {
  isDeleted: false,
  scope: CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC),
};

export const PUBLIC_BRAND_FILTER = {
  brand: { is: PUBLIC_BRAND_WHERE },
};

/** The brand fields a public article carries: enough to link its profile. */
export const PUBLIC_ARTICLE_BRAND_INCLUDE = {
  brand: {
    select: { id: true, isDeleted: true, label: true, scope: true, slug: true },
  },
};

interface PublicBrandProjection {
  isDeleted?: unknown;
  scope?: unknown;
}

interface WithIncludedBrand {
  brand?: PublicBrandProjection | null;
}

/**
 * Keeps an included brand only when it is public. Genfeed's own articles may
 * belong to a private brand; those render under `@genfeedai` and must not
 * reveal the private brand's handle.
 */
export function stripPrivateBrand<T extends object>(doc: T): T {
  const { brand, ...rest } = doc as T & WithIncludedBrand;
  if (
    brand &&
    brand.isDeleted === false &&
    brand.scope === PUBLIC_BRAND_WHERE.scope
  ) {
    return doc;
  }
  return rest as T;
}
