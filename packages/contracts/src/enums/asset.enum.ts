/**
 * Asset category. Values match Prisma `AssetCategory`.
 * @see packages/prisma/prisma/schema.prisma `enum AssetCategory`
 */
export enum AssetCategory {
  LOGO = 'LOGO',
  BANNER = 'BANNER',
  REFERENCE = 'REFERENCE',
  FONT = 'FONT',
}

/**
 * Asset parent type. Values match Prisma `AssetParent`.
 * @see packages/prisma/prisma/schema.prisma `enum AssetParent`
 */
export enum AssetParent {
  ORGANIZATION = 'ORGANIZATION',
  INGREDIENT = 'INGREDIENT',
  BRAND = 'BRAND',
  ARTICLE = 'ARTICLE',
}

/**
 * The slot a brand logo or platform image fills in the brand kit. Values
 * match Prisma `BrandKitSlot`. LOGO assets take a `LOGO_*` variant; BANNER
 * assets take `BANNER_MASTER` or a platform slot. A brand keeps one live asset
 * per slot. An asset without a slot reads as `LOGO_PRIMARY` or `BANNER_MASTER`.
 * @see packages/prisma/prisma/schema.prisma `enum BrandKitSlot`
 */
export enum BrandKitSlot {
  LOGO_PRIMARY = 'LOGO_PRIMARY',
  LOGO_ICON = 'LOGO_ICON',
  LOGO_WORDMARK = 'LOGO_WORDMARK',
  LOGO_LIGHT = 'LOGO_LIGHT',
  LOGO_DARK = 'LOGO_DARK',
  LOGO_MONOCHROME = 'LOGO_MONOCHROME',
  BANNER_MASTER = 'BANNER_MASTER',
  X_HEADER = 'X_HEADER',
  X_PROFILE = 'X_PROFILE',
  YOUTUBE_BANNER = 'YOUTUBE_BANNER',
  YOUTUBE_PROFILE = 'YOUTUBE_PROFILE',
  LINKEDIN_COVER = 'LINKEDIN_COVER',
  LINKEDIN_LOGO = 'LINKEDIN_LOGO',
  FACEBOOK_COVER = 'FACEBOOK_COVER',
  FACEBOOK_PROFILE = 'FACEBOOK_PROFILE',
}
