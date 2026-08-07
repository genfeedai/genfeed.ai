/**
 * Ownership scope. Values match Prisma `AssetScope` (exported as AssetScope
 * from ingredient.enum). Used as AssetScope on ingredient/asset columns.
 * @see packages/prisma/prisma/schema.prisma `enum AssetScope`
 */
export enum Scope {
  USER = 'USER',
  BRAND = 'BRAND',
  ORGANIZATION = 'ORGANIZATION',
  PUBLIC = 'PUBLIC',
}
