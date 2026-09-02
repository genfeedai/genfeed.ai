import { AssetScope } from '@genfeedai/contracts';

/**
 * Whether a persisted scope value means "visible to everyone".
 *
 * `AssetScope` mirrors the Prisma `AssetScope` enum 1:1 (SCREAMING_SNAKE,
 * `PUBLIC`). Comparing through `.toUpperCase()` keeps this helper resilient
 * to any stray legacy-lowercase value that predates the SCREAMING_SNAKE
 * harmonization — a bare `scope === AssetScope.PUBLIC` would silently report
 * "Private" for one of those. Compare through this helper instead.
 */
export function isPublicAssetScope(
  scope: string | null | undefined,
): scope is string {
  return typeof scope === 'string' && scope.toUpperCase() === AssetScope.PUBLIC;
}
