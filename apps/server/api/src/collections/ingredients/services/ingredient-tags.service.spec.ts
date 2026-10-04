import { IngredientTagsService } from '@api/collections/ingredients/services/ingredient-tags.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetScope, TagBulkAction } from '@genfeedai/contracts';
import { LIBRARY_BULK_TAG_LIMIT } from '@genfeedai/contracts/constants';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';

interface FakeAsset {
  brandId: string | null;
  id: string;
  scope: AssetScope;
  tagIds: Set<string>;
  userId: string;
}

/**
 * A small in-memory Prisma: enough of `tag.findFirst`, `ingredient.findMany`
 * and `tag.update` to run the real bulk method against seeded assets, so the
 * isolation and partial-skip rules are exercised end to end rather than as
 * mock call shapes.
 */
function createFakePrisma(
  tags: Array<{
    brandId: string | null;
    id: string;
    organizationId: string | null;
  }>,
  assets: FakeAsset[],
  organizationId: string,
) {
  const update = vi.fn(
    async (args: {
      data: {
        ingredients: {
          connect?: Array<{ id: string }>;
          disconnect?: Array<{ id: string }>;
        };
      };
      where: { id: string };
    }) => {
      const { connect = [], disconnect = [] } = args.data.ingredients;
      for (const { id } of connect) {
        assets.find((asset) => asset.id === id)?.tagIds.add(args.where.id);
      }
      for (const { id } of disconnect) {
        assets.find((asset) => asset.id === id)?.tagIds.delete(args.where.id);
      }
      return { id: args.where.id };
    },
  );

  return {
    ingredient: {
      findMany: vi.fn(
        async (args: {
          where: {
            id: { in: string[] };
            organizationId: string;
            tags?: { some: { id: string } };
          };
        }) =>
          assets
            .filter(
              (asset) =>
                args.where.organizationId === organizationId &&
                args.where.id.in.includes(asset.id) &&
                (!args.where.tags || asset.tagIds.has(args.where.tags.some.id)),
            )
            .map(({ brandId, id, scope, userId }) => ({
              brandId,
              id,
              scope,
              userId,
            })),
      ),
    },
    tag: {
      findFirst: vi.fn(async (args: { where: { id: string } }) => {
        const tag = tags.find((candidate) => candidate.id === args.where.id);
        return tag ?? null;
      }),
      update,
    },
  };
}

describe('IngredientTagsService.bulkSetTag', () => {
  const organizationId = testId('org');
  const brandA = testId('brand', 1);
  const brandB = testId('brand', 2);
  const me = testId('user', 1);
  const teammate = testId('user', 2);
  const editor = { brandId: brandA, userIds: [me] };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const brandATag = { brandId: brandA, id: testId('tag', 1), organizationId };
  const orgWideTag = { brandId: null, id: testId('tag', 2), organizationId };
  const brandBTag = { brandId: brandB, id: testId('tag', 3), organizationId };
  const defaultTag = {
    brandId: null,
    id: testId('tag', 4),
    organizationId: null,
  };
  const tags = [brandATag, orgWideTag, brandBTag, defaultTag];

  function seed(count: number, overrides: Partial<FakeAsset> = {}) {
    return testIds('ingredient', count).map<FakeAsset>((id) => ({
      brandId: brandA,
      id,
      scope: AssetScope.ORGANIZATION,
      tagIds: new Set(),
      userId: teammate,
      ...overrides,
    }));
  }

  function build(assets: FakeAsset[]) {
    const prisma = createFakePrisma(tags, assets, organizationId);
    const service = new IngredientTagsService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
    return { prisma, service };
  }

  beforeEach(() => vi.clearAllMocks());

  it('tags the limit of assets in one write and reports the counts', async () => {
    const assets = seed(LIBRARY_BULK_TAG_LIMIT);
    const { prisma, service } = build(assets);

    const result = await service.bulkSetTag({
      action: TagBulkAction.ADD,
      editor,
      ids: assets.map((asset) => asset.id),
      organizationId,
      tagId: brandATag.id,
    });

    expect(result).toMatchObject({
      changed: LIBRARY_BULK_TAG_LIMIT,
      failed: 0,
      skipped: 0,
    });
    expect(assets.every((asset) => asset.tagIds.has(brandATag.id))).toBe(true);
    expect(prisma.tag.update).toHaveBeenCalledTimes(1);
  });

  it('removes a tag from the assets that carry it and keeps the assets', async () => {
    const assets = seed(3);
    assets[0]?.tagIds.add(brandATag.id);
    assets[1]?.tagIds.add(brandATag.id);
    const { service } = build(assets);

    const result = await service.bulkSetTag({
      action: TagBulkAction.REMOVE,
      editor,
      ids: assets.map((asset) => asset.id),
      organizationId,
      tagId: brandATag.id,
    });

    expect(result).toMatchObject({ changed: 2, skipped: 1, failed: 0 });
    expect(result.skippedIds).toEqual([assets[2]?.id]);
    expect(assets.some((asset) => asset.tagIds.has(brandATag.id))).toBe(false);
    expect(assets).toHaveLength(3);
  });

  it('skips assets that already have the tag instead of changing them twice', async () => {
    const assets = seed(2);
    assets[0]?.tagIds.add(brandATag.id);
    const { service } = build(assets);

    const result = await service.bulkSetTag({
      action: TagBulkAction.ADD,
      editor,
      ids: assets.map((asset) => asset.id),
      organizationId,
      tagId: brandATag.id,
    });

    expect(result).toMatchObject({ changed: 1, skipped: 1 });
    expect(result.skippedIds).toEqual([assets[0]?.id]);
  });

  describe('partial skips', () => {
    it('skips assets the member cannot edit and tags the rest', async () => {
      const editable = seed(2);
      const personalOfTeammate = seed(1, {
        id: testId('private'),
        scope: AssetScope.USER,
      });
      const ownPersonal = seed(1, {
        id: testId('own'),
        scope: AssetScope.USER,
        userId: me,
      });
      const assets = [...editable, ...personalOfTeammate, ...ownPersonal];
      const { service } = build(assets);

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: assets.map((asset) => asset.id),
        organizationId,
        tagId: brandATag.id,
      });

      expect(result).toMatchObject({ changed: 3, failed: 0, skipped: 1 });
      expect(result.skippedIds).toEqual([personalOfTeammate[0]?.id]);
      expect(personalOfTeammate[0]?.tagIds.size).toBe(0);
    });

    it('skips ids that are missing, deleted or in another organization', async () => {
      const assets = seed(1);
      const { service } = build(assets);
      const ghost = testId('ghost');

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: [...assets.map((asset) => asset.id), ghost],
        organizationId,
        tagId: brandATag.id,
      });

      expect(result).toMatchObject({ changed: 1, skipped: 1 });
      expect(result.skippedIds).toEqual([ghost]);
    });

    it('de-duplicates repeated ids', async () => {
      const assets = seed(1);
      const { service } = build(assets);

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: [assets[0]?.id ?? '', assets[0]?.id ?? ''],
        organizationId,
        tagId: brandATag.id,
      });

      expect(result).toMatchObject({ changed: 1, skipped: 0 });
    });
  });

  describe('brand and organization isolation', () => {
    it('never attaches a brand’s tag to an asset of another brand', async () => {
      const inBrandB = seed(2, { brandId: brandB });
      const inBrandA = seed(1, { id: testId('branda') });
      const assets = [...inBrandB, ...inBrandA];
      const { service } = build(assets);

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor: { brandId: brandA, userIds: [me] },
        ids: assets.map((asset) => asset.id),
        organizationId,
        tagId: brandATag.id,
      });

      expect(result).toMatchObject({ changed: 1, skipped: 2 });
      expect(inBrandB.every((asset) => asset.tagIds.size === 0)).toBe(true);
    });

    it('attaches an organization-wide tag in every brand', async () => {
      const assets = [
        ...seed(1, { brandId: brandA, id: testId('assetone') }),
        ...seed(1, {
          brandId: brandB,
          id: testId('assettwo'),
          scope: AssetScope.ORGANIZATION,
        }),
      ];
      const { service } = build(assets);

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: assets.map((asset) => asset.id),
        organizationId,
        tagId: orgWideTag.id,
      });

      expect(result).toMatchObject({ changed: 2, skipped: 0 });
    });

    it('treats a legacy default tag as usable everywhere', async () => {
      const assets = seed(1);
      const { service } = build(assets);

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: [assets[0]?.id ?? ''],
        organizationId,
        tagId: defaultTag.id,
      });

      expect(result.changed).toBe(1);
    });

    it('can still remove another brand’s tag from an asset, since removal never widens access', async () => {
      const assets = seed(1);
      assets[0]?.tagIds.add(brandBTag.id);
      const { service } = build(assets);

      const result = await service.bulkSetTag({
        action: TagBulkAction.REMOVE,
        editor,
        ids: [assets[0]?.id ?? ''],
        organizationId,
        tagId: brandBTag.id,
      });

      expect(result.changed).toBe(1);
    });

    it('answers not found for a tag outside the organization', async () => {
      const { prisma, service } = build(seed(1));
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(
        service.bulkSetTag({
          action: TagBulkAction.ADD,
          editor,
          ids: [testId('ingredient')],
          organizationId,
          tagId: testId('foreigntag'),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });

    it('queries assets only inside the caller’s organization and never writes without a scoped tag', async () => {
      const assets = seed(1);
      const { prisma, service } = build(assets);

      await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: [assets[0]?.id ?? ''],
        organizationId,
        tagId: brandATag.id,
      });

      expect(prisma.ingredient.findMany.mock.calls[0]?.[0].where).toMatchObject(
        { isDeleted: false, organizationId },
      );
      expect(prisma.tag.update.mock.calls[0]?.[0].where).toMatchObject({
        isDeleted: false,
        OR: [{ organizationId }, { organizationId: null, userId: null }],
      });
    });
  });

  describe('failure reporting', () => {
    it('reports a failed write instead of throwing, with nothing counted as changed', async () => {
      const assets = seed(3);
      const { prisma, service } = build(assets);
      prisma.tag.update.mockRejectedValueOnce(new Error('deadlock'));

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: assets.map((asset) => asset.id),
        organizationId,
        tagId: brandATag.id,
      });

      expect(result).toMatchObject({ changed: 0, failed: 3, skipped: 0 });
      expect(result.failedIds).toEqual(assets.map((asset) => asset.id));
      expect(logger.error).toHaveBeenCalled();
    });

    it('does not write at all when nothing needs changing', async () => {
      const assets = seed(2);
      for (const asset of assets) {
        asset.tagIds.add(brandATag.id);
      }
      const { prisma, service } = build(assets);

      const result = await service.bulkSetTag({
        action: TagBulkAction.ADD,
        editor,
        ids: assets.map((asset) => asset.id),
        organizationId,
        tagId: brandATag.id,
      });

      expect(result).toMatchObject({ changed: 0, skipped: 2 });
      expect(prisma.tag.update).not.toHaveBeenCalled();
    });
  });
});
