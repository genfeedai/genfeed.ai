import { AssetScope } from '@genfeedai/contracts';

export interface TagEditableAsset {
  brandId?: string | null;
  scope?: string | null;
  userId?: string | null;
}

export interface TagEditor {
  brandId?: string | null;
  /** Every id the member is known by (`userId` and the token subject). */
  userIds: readonly (string | undefined)[];
}

/**
 * Whether a member may change an asset's tags. The asset must already be in the
 * member's organization (callers query it that way); this mirrors
 * `AssetAccessGuard`, the edit gate on the single-asset tag route, so the bulk
 * route can never do more than the single one:
 *
 * - the owner may always edit
 * - an organization or public asset is editable by the organization
 * - a brand asset is editable from that brand
 * - a personal asset is editable only by its owner
 */
export function canEditAssetTags(
  asset: TagEditableAsset,
  editor: TagEditor,
): boolean {
  if (asset.userId && editor.userIds.includes(asset.userId)) {
    return true;
  }

  const scope =
    typeof asset.scope === 'string' ? asset.scope.trim().toUpperCase() : '';

  switch (scope) {
    case AssetScope.ORGANIZATION:
    case AssetScope.PUBLIC:
      return true;
    case AssetScope.BRAND:
      return Boolean(asset.brandId) && asset.brandId === editor.brandId;
    default:
      return false;
  }
}
