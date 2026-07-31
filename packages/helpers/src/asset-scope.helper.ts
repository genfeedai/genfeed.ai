import { AssetScope } from '@genfeedai/enums';

/**
 * Whether a persisted scope value means "visible to everyone".
 *
 * The Prisma `AssetScope` enum is UPPERCASE (`PUBLIC`) while the TypeScript
 * `AssetScope` enum is lowercase (`public`). Client models normalize on read,
 * but a bare `scope === AssetScope.PUBLIC` silently reports "Private" for any
 * value that skipped that normalization. Compare through this helper instead.
 */
export function isPublicAssetScope(
  scope: string | null | undefined,
): scope is string {
  return typeof scope === 'string' && scope.toLowerCase() === AssetScope.PUBLIC;
}
