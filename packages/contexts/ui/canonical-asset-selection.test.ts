import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import { createCanonicalAssetSelection } from './canonical-asset-selection';

function ingredient(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    brand: 'brand-record',
    category: IngredientCategory.IMAGE,
    createdAt: '2026-07-13T10:00:00.000Z',
    hasVoted: false,
    id: 'ingredient-v3',
    isDefault: false,
    isDeleted: false,
    isFavorite: false,
    isHighlighted: false,
    isVoteAnimating: false,
    organization: 'organization-record',
    scope: 'brand' as IIngredient['scope'],
    status: IngredientStatus.GENERATED,
    totalChildren: 0,
    totalVotes: 0,
    updatedAt: '2026-07-13T10:00:00.000Z',
    user: 'user-1',
    version: 3,
    ...overrides,
  };
}

describe('createCanonicalAssetSelection', () => {
  it('maps a selected ingredient and version without creating an immutable pin', () => {
    expect(
      createCanonicalAssetSelection(ingredient({ parent: 'ingredient-root' }), {
        brandId: 'brand-fallback',
        organizationId: 'organization-fallback',
      }),
    ).toMatchObject({
      reference: {
        brandId: 'brand-record',
        kind: 'ingredient',
        organizationId: 'organization-record',
        recordId: 'ingredient-v3',
        serializer: 'ingredient',
      },
      version: {
        id: 'ingredient-v3',
        number: 3,
        parentId: 'ingredient-root',
      },
    });
  });

  it('uses authenticated scope hints when sparse list records omit ownership', () => {
    expect(
      createCanonicalAssetSelection(
        ingredient({ brand: undefined, organization: '' }),
        {
          brandId: 'brand-fallback',
          organizationId: 'organization-fallback',
        },
      )?.reference,
    ).toEqual({
      brandId: 'brand-fallback',
      kind: 'ingredient',
      organizationId: 'organization-fallback',
      recordId: 'ingredient-v3',
      serializer: 'ingredient',
    });
  });

  it('returns no canonical selection without a selected record and scope', () => {
    expect(
      createCanonicalAssetSelection(null, {
        brandId: 'brand-1',
        organizationId: 'organization-1',
      }),
    ).toBeNull();
    expect(
      createCanonicalAssetSelection(ingredient(), {
        organizationId: '',
      }),
    ).toBeNull();
  });
});
