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

export function buildAssetParentColumns(
  parentType: AssetParent,
  parentId: string,
): AssetParentColumns {
  return {
    parentArticleId: null,
    parentBrandId: null,
    parentIngredientId: null,
    parentOrgId: null,
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
