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
