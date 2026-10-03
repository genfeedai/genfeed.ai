import { AssetParent } from '@genfeedai/contracts';

export interface AssetParentColumns {
  parentArticleId: string | null;
  parentBrandId: string | null;
  parentIngredientId: string | null;
  parentOrgId: string | null;
  parentType: AssetParent;
}

const parentIdFieldByType = {
  [AssetParent.ARTICLE]: 'parentArticleId',
  [AssetParent.BRAND]: 'parentBrandId',
  [AssetParent.INGREDIENT]: 'parentIngredientId',
  [AssetParent.ORGANIZATION]: 'parentOrgId',
} as const satisfies Record<AssetParent, keyof AssetParentColumns>;

/**
 * `organizationId` scopes a non-organization parent (a brand's logo) to its
 * tenant: org-scoped readers such as the brand kit resolver match on
 * `parentOrgId`, so a brand asset without it is never found.
 */
export function buildAssetParentColumns(
  parentType: AssetParent,
  parentId: string,
  organizationId?: string | null,
): AssetParentColumns {
  return {
    parentArticleId: null,
    parentBrandId: null,
    parentIngredientId: null,
    parentOrgId: organizationId ?? null,
    parentType,
    [parentIdFieldByType[parentType]]: parentId,
  };
}

export function getAssetParentId(
  asset: Pick<
    AssetParentColumns,
    'parentArticleId' | 'parentBrandId' | 'parentIngredientId' | 'parentOrgId'
  >,
): string | null {
  return (
    asset.parentBrandId ??
    asset.parentOrgId ??
    asset.parentIngredientId ??
    asset.parentArticleId
  );
}

export function getAssetParentIdField(
  parentType: AssetParent,
): keyof Omit<AssetParentColumns, 'parentType'> {
  return parentIdFieldByType[parentType];
}
