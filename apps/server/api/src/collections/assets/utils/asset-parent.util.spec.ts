import {
  buildAssetParentColumns,
  getAssetParentId,
  getAssetParentIdField,
} from '@api/collections/assets/utils/asset-parent.util';
import { AssetParent } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('asset-parent.util', () => {
  it('sets only the column that matches the parent type', () => {
    expect(buildAssetParentColumns(AssetParent.BRAND, 'brand_1')).toEqual({
      parentArticleId: null,
      parentBrandId: 'brand_1',
      parentIngredientId: null,
      parentOrgId: null,
      parentType: AssetParent.BRAND,
    });
    expect(getAssetParentIdField(AssetParent.ARTICLE)).toBe('parentArticleId');
  });

  it('prefers brand, then org, ingredient, and article ids', () => {
    expect(
      getAssetParentId({
        parentArticleId: 'art_1',
        parentBrandId: 'brand_1',
        parentIngredientId: 'ing_1',
        parentOrgId: 'org_1',
      }),
    ).toBe('brand_1');
    expect(
      getAssetParentId({
        parentArticleId: 'art_1',
        parentBrandId: null,
        parentIngredientId: 'ing_1',
        parentOrgId: null,
      }),
    ).toBe('ing_1');
    expect(
      getAssetParentId({
        parentArticleId: null,
        parentBrandId: null,
        parentIngredientId: null,
        parentOrgId: null,
      }),
    ).toBeNull();
  });
});
