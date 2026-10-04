import { canEditAssetTags } from '@api/collections/ingredients/utils/ingredient-tag-edit-access.util';
import { AssetScope } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';

describe('canEditAssetTags', () => {
  const userId = testId('user');
  const otherUserId = testId('user', 2);
  const brandId = testId('brand');
  const editor = { brandId, userIds: [userId, 'token-subject'] };

  it('lets the owner edit an asset of any scope', () => {
    for (const scope of Object.values(AssetScope)) {
      expect(canEditAssetTags({ scope, userId }, editor)).toBe(true);
    }
  });

  it('recognizes the owner by the token subject too', () => {
    expect(
      canEditAssetTags(
        { scope: AssetScope.USER, userId: 'token-subject' },
        editor,
      ),
    ).toBe(true);
  });

  it('lets the organization edit organization and public assets', () => {
    for (const scope of [AssetScope.ORGANIZATION, AssetScope.PUBLIC]) {
      expect(canEditAssetTags({ scope, userId: otherUserId }, editor)).toBe(
        true,
      );
    }
  });

  it('lets a brand asset be edited only from that brand', () => {
    const asset = { scope: AssetScope.BRAND, userId: otherUserId };

    expect(canEditAssetTags({ ...asset, brandId }, editor)).toBe(true);
    expect(
      canEditAssetTags({ ...asset, brandId: testId('brand', 2) }, editor),
    ).toBe(false);
    expect(canEditAssetTags({ ...asset, brandId: null }, editor)).toBe(false);
    expect(canEditAssetTags({ ...asset, brandId }, { userIds: [userId] })).toBe(
      false,
    );
  });

  it('keeps a personal asset to its owner, and unknown scopes closed', () => {
    expect(
      canEditAssetTags({ scope: AssetScope.USER, userId: otherUserId }, editor),
    ).toBe(false);
    expect(canEditAssetTags({ scope: null, userId: otherUserId }, editor)).toBe(
      false,
    );
    expect(
      canEditAssetTags({ scope: 'mystery', userId: otherUserId }, editor),
    ).toBe(false);
  });

  it('reads the scope in any case', () => {
    expect(
      canEditAssetTags({ scope: 'organization', userId: otherUserId }, editor),
    ).toBe(true);
  });
});
