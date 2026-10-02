import { resolveCrunReferences } from '@api/services/integrations/crun/crun-reference.util';
import { AssetParent } from '@genfeedai/contracts';
import type { Asset } from '@genfeedai/prisma';

function fixture(overrides: Partial<Asset> = {}) {
  const asset = {
    id: 'asset',
    userId: 'user',
    category: 'REFERENCE',
    isDeleted: false,
    mimeType: 'image/png',
    parentType: AssetParent.BRAND,
    parentBrandId: 'brand',
    parentOrgId: 'org',
    parentIngredientId: null,
    parentArticleId: null,
    ...overrides,
  };
  const assets = {
    findOne: vi.fn(
      async (_where: unknown): Promise<typeof asset | null> => asset,
    ),
  };
  const ingredients = {
    findOne: vi.fn(
      async (_where: unknown): Promise<{ id: string } | null> => null,
    ),
  };
  const prisma = {
    brand: {
      findFirst: vi.fn(
        async (): Promise<{ id: string } | null> => ({
          id: asset.parentBrandId ?? 'brand',
        }),
      ),
    },
    organization: {
      findFirst: vi.fn(
        async (): Promise<{ id: string } | null> => ({ id: 'org' }),
      ),
    },
    ingredient: {
      findFirst: vi.fn(
        async (): Promise<{ brandId: string | null } | null> => ({
          brandId: 'brand',
        }),
      ),
    },
    article: {
      findFirst: vi.fn(
        async (): Promise<{ brandId: string | null } | null> => ({
          brandId: 'brand',
        }),
      ),
    },
  };
  const context = {
    prisma: prisma as never,
    assets: assets as never,
    ingredients: ingredients as never,
    config: {
      cdnUrl: 'https://cdn.test',
      ingredientsEndpoint: 'https://owned.test',
    } as never,
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    referenceIds: ['asset'],
    mode: 'image' as 'image' | 'video-frame',
  };
  return { asset, assets, ingredients, prisma, context };
}
describe('Crun canonical reference authorization', () => {
  it.each([
    { parentType: AssetParent.BRAND },
    { parentType: AssetParent.ORGANIZATION, parentBrandId: null },
    { parentType: AssetParent.INGREDIENT, parentIngredientId: 'parent' },
    { parentType: AssetParent.ARTICLE, parentArticleId: 'parent' },
  ])(
    'authorizes the live canonical parent %j and uses actual user-scoped asset fields',
    async (parent) => {
      const f = fixture(parent);
      expect(await resolveCrunReferences(f.context)).toEqual([
        {
          id: 'asset',
          url: 'https://cdn.test/references/asset',
          kind: 'reference-asset',
        },
      ]);
      expect(f.assets.findOne).toHaveBeenCalledWith({
        id: 'asset',
        userId: 'user',
        category: 'REFERENCE',
        isDeleted: false,
      });
      expect(f.assets.findOne.mock.calls[0]?.[0]).not.toHaveProperty(
        'organizationId',
      );
    },
  );
  it('rejects a foreign-user asset through the canonical user-scoped lookup', async () => {
    const f = fixture({ userId: 'foreign-user' });
    f.assets.findOne.mockResolvedValue(null);
    expect(await resolveCrunReferences(f.context)).toBeNull();
    expect(f.assets.findOne).toHaveBeenCalledWith({
      id: 'asset',
      userId: 'user',
      category: 'REFERENCE',
      isDeleted: false,
    });
  });
  it.each(['ingredient', 'article'] as const)(
    'requires selected-brand scope on the %s parent for video frames',
    async (parent) => {
      const f = fixture({
        parentType:
          parent === 'ingredient'
            ? AssetParent.INGREDIENT
            : AssetParent.ARTICLE,
        parentIngredientId: parent === 'ingredient' ? 'parent' : null,
        parentArticleId: parent === 'article' ? 'parent' : null,
      });
      f.prisma[parent].findFirst.mockResolvedValue(null);
      expect(
        await resolveCrunReferences({ ...f.context, mode: 'video-frame' }),
      ).toBeNull();
      expect(f.prisma[parent].findFirst).toHaveBeenCalledWith({
        where: {
          id: 'parent',
          organizationId: 'org',
          isDeleted: false,
          brandId: 'brand',
        },
        select: { brandId: true },
      });
    },
  );
  it('allows image thumbnails but never resolves video ingredients as video frames', async () => {
    const f = fixture();
    f.assets.findOne.mockResolvedValue(null);
    f.ingredients.findOne.mockImplementation(async (where) =>
      (where as { category: string }).category === 'VIDEO'
        ? { id: 'video' }
        : null,
    );
    expect(await resolveCrunReferences(f.context)).toEqual([
      {
        id: 'asset',
        url: 'https://owned.test/thumbnails/video',
        kind: 'video-thumbnail',
      },
    ]);
    f.ingredients.findOne.mockClear();
    expect(
      await resolveCrunReferences({ ...f.context, mode: 'video-frame' }),
    ).toBeNull();
    expect(f.ingredients.findOne).toHaveBeenCalledTimes(1);
    expect(f.ingredients.findOne).toHaveBeenCalledWith({
      id: 'asset',
      organizationId: 'org',
      isDeleted: false,
      category: 'IMAGE',
      brandId: 'brand',
    });
  });
  it('keeps mixed reference order and performs one lookup per repeated ID', async () => {
    const f = fixture();
    f.context.referenceIds = ['image', 'asset', 'image'];
    f.ingredients.findOne.mockImplementation(async (where) =>
      (where as { id: string; category: string }).id === 'image'
        ? { id: 'image' }
        : null,
    );
    expect(await resolveCrunReferences(f.context)).toEqual([
      {
        id: 'image',
        url: 'https://owned.test/images/image',
        kind: 'image-ingredient',
      },
      {
        id: 'asset',
        url: 'https://cdn.test/references/asset',
        kind: 'reference-asset',
      },
      {
        id: 'image',
        url: 'https://owned.test/images/image',
        kind: 'image-ingredient',
      },
    ]);
    expect(f.assets.findOne).toHaveBeenCalledTimes(1);
    expect(
      f.ingredients.findOne.mock.calls.filter(
        ([where]) => (where as { id: string }).id === 'image',
      ),
    ).toHaveLength(1);
  });
  it('preserves same-org cross-brand image assets but denies them as video frames', async () => {
    const f = fixture({ parentBrandId: 'other-brand' });
    expect(await resolveCrunReferences(f.context)).not.toBeNull();
    expect(
      await resolveCrunReferences({ ...f.context, mode: 'video-frame' }),
    ).toBeNull();
  });
  it.each(['image', 'video-frame'] as const)(
    'accepts organization assets without brand context in %s',
    async (mode) => {
      const f = fixture({
        parentType: AssetParent.ORGANIZATION,
        parentBrandId: null,
      });
      expect(
        await resolveCrunReferences({ ...f.context, mode }),
      ).not.toBeNull();
    },
  );
  it.each([
    { parentOrgId: 'foreign' },
    { parentType: AssetParent.BRAND, parentBrandId: null },
    { parentType: AssetParent.INGREDIENT, parentIngredientId: null },
    { parentType: AssetParent.ARTICLE, parentArticleId: null },
    { parentType: AssetParent.ORGANIZATION, parentOrgId: null },
    { parentIngredientId: 'unrelated' },
    { parentArticleId: 'unrelated' },
    { mimeType: 'video/mp4' },
  ])(
    'denies missing/contradictory parent or MIME %j without partial success',
    async (invalid) => {
      const f = fixture(invalid);
      f.context.referenceIds = ['image', 'asset'];
      f.ingredients.findOne.mockImplementation(async (where) =>
        (where as { id: string }).id === 'image' ? { id: 'image' } : null,
      );
      expect(await resolveCrunReferences(f.context)).toBeNull();
    },
  );
  it.each(['brand', 'organization', 'ingredient', 'article'] as const)(
    'denies a foreign/deleted/missing %s parent',
    async (parent) => {
      const kinds = {
        brand: AssetParent.BRAND,
        organization: AssetParent.ORGANIZATION,
        ingredient: AssetParent.INGREDIENT,
        article: AssetParent.ARTICLE,
      };
      const f = fixture({
        parentType: kinds[parent],
        parentIngredientId: parent === 'ingredient' ? 'parent' : null,
        parentArticleId: parent === 'article' ? 'parent' : null,
      });
      f.prisma[parent].findFirst.mockResolvedValue(null);
      expect(await resolveCrunReferences(f.context)).toBeNull();
    },
  );
  it('denies contradictory brand context on a brandless parent', async () => {
    const f = fixture({
      parentType: AssetParent.INGREDIENT,
      parentIngredientId: 'parent',
    });
    f.prisma.ingredient.findFirst.mockResolvedValue({ brandId: null });
    expect(await resolveCrunReferences(f.context)).toBeNull();
  });
  it('fails closed on lookup errors and does not retry unscoped', async () => {
    const f = fixture();
    f.assets.findOne.mockRejectedValue(new Error('lookup failed'));
    expect(await resolveCrunReferences(f.context)).toBeNull();
    expect(f.assets.findOne).toHaveBeenCalledTimes(1);
  });
});
