vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn(() => {
    throw new Error('not found');
  }),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsTagsController } from '@api/collections/ingredients/controllers/ingredients-tags.controller';
import type { BulkTagIngredientsDto } from '@api/collections/ingredients/dto/bulk-tag-ingredients.dto';
import type {
  BulkSetTagParams,
  IngredientTagsService,
} from '@api/collections/ingredients/services/ingredient-tags.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { CacheService } from '@api/services/cache/cache.service';
import { TagBulkAction } from '@genfeedai/contracts';
import type { IBulkTagResult } from '@genfeedai/contracts/interfaces';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

interface StoredAsset {
  brandId: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  tags: string[];
}

describe('IngredientsTagsController', () => {
  const organizationId = testId('org');
  const otherOrganizationId = testId('org', 2);
  const brandId = testId('brand');
  const userId = testId('user');
  const ingredientId = testId('ingredient');
  const foreignIngredientId = testId('ingredient', 3);
  const [firstTagId, secondTagId] = testIds('tag', 2);
  const refusedTagId = testId('tag', 9);
  const user = { brandId, id: 'user_123', organizationId, userId } as User;
  const request = { originalUrl: '/api/ingredients' } as Request;

  let assets: Map<string, StoredAsset>;
  let tagChecks: Array<{ brandId: string; organizationId: string }>;
  let bulkRequests: BulkSetTagParams[];
  let bulkOutcome: IBulkTagResult | Error;
  let invalidatedTags: string[][];
  let isCacheDown: boolean;
  let warnings: string[];

  const ingredientsService = {
    assertClientTags: async (
      tags: string[],
      orgId: string,
      assetBrandId: string,
    ): Promise<void> => {
      tagChecks.push({ brandId: assetBrandId, organizationId: orgId });
      if (tags.includes(refusedTagId)) {
        throw new Error('Tags must belong to the asset brand');
      }
    },
    findOneSelect: async (where: {
      id: string;
      isDeleted: boolean;
      organizationId: string;
    }): Promise<{ brandId: string } | null> => {
      const asset = assets.get(where.id);
      if (
        !asset ||
        asset.organizationId !== where.organizationId ||
        asset.isDeleted !== where.isDeleted
      ) {
        return null;
      }
      return { brandId: asset.brandId };
    },
    patch: async (
      id: string,
      update: { tags: string[] },
    ): Promise<StoredAsset> => {
      const asset = assets.get(id);
      if (!asset) {
        throw new Error(`missing asset ${id}`);
      }
      const next = { ...asset, tags: update.tags };
      assets.set(id, next);
      return next;
    },
  };
  const ingredientTagsService = {
    bulkSetTag: async (input: BulkSetTagParams): Promise<IBulkTagResult> => {
      bulkRequests.push(input);
      if (bulkOutcome instanceof Error) {
        throw bulkOutcome;
      }
      return bulkOutcome;
    },
  };
  const cacheService = {
    invalidateByTags: async (tags: string[]): Promise<number> => {
      if (isCacheDown) {
        throw new Error('redis down');
      }
      invalidatedTags.push(tags);
      return 1;
    },
  };
  const logger = {
    warn: (message: string) => {
      warnings.push(message);
    },
  };
  const moduleRef = {
    get: (token: unknown) =>
      token === CacheService ? cacheService : undefined,
  };

  const controller = new IngredientsTagsController(
    ingredientsService as unknown as IngredientsService,
    ingredientTagsService as unknown as IngredientTagsService,
    logger as unknown as LoggerService,
    moduleRef as unknown as ModuleRef,
  );

  beforeEach(() => {
    assets = new Map([
      [
        ingredientId,
        {
          brandId,
          id: ingredientId,
          isDeleted: false,
          organizationId,
          tags: [],
        },
      ],
      [
        foreignIngredientId,
        {
          brandId: testId('brand', 2),
          id: foreignIngredientId,
          isDeleted: false,
          organizationId: otherOrganizationId,
          tags: [secondTagId],
        },
      ],
    ]);
    tagChecks = [];
    bulkRequests = [];
    bulkOutcome = {
      changed: 2,
      failed: 0,
      failedIds: [],
      skipped: 0,
      skippedIds: [],
    };
    invalidatedTags = [];
    isCacheDown = false;
    warnings = [];
  });

  it('keeps the single-asset tag route behind the asset access guard', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      IngredientsTagsController.prototype.updateTags,
    ) as unknown[];

    expect(guards).toContain(AssetAccessGuard);
  });

  describe('updateTags', () => {
    it('stores the asset’s tags once its brand can use them', async () => {
      const response = await controller.updateTags(
        request,
        ingredientId,
        user,
        { tags: [firstTagId, secondTagId] },
      );

      expect(tagChecks).toEqual([{ brandId, organizationId }]);
      expect(assets.get(ingredientId)?.tags).toEqual([firstTagId, secondTagId]);
      expect(response).toEqual({
        data: expect.objectContaining({
          id: ingredientId,
          tags: [firstTagId, secondTagId],
        }),
      });
    });

    it('keeps the old tags when a tag is refused', async () => {
      await expect(
        controller.updateTags(request, ingredientId, user, {
          tags: [firstTagId, refusedTagId],
        }),
      ).rejects.toThrow('Tags must belong');

      expect(assets.get(ingredientId)?.tags).toEqual([]);
    });

    it('answers not found for an asset in another organization and leaves it alone', async () => {
      await expect(
        controller.updateTags(request, foreignIngredientId, user, {
          tags: [firstTagId],
        }),
      ).rejects.toThrow('not found');

      expect(tagChecks).toEqual([]);
      expect(assets.get(foreignIngredientId)?.tags).toEqual([secondTagId]);
    });

    it('answers not found for a deleted asset', async () => {
      assets.set(ingredientId, {
        ...(assets.get(ingredientId) as StoredAsset),
        isDeleted: true,
      });

      await expect(
        controller.updateTags(request, ingredientId, user, { tags: [] }),
      ).rejects.toThrow('not found');
    });
  });

  describe('bulkTag', () => {
    const dto: BulkTagIngredientsDto = {
      action: TagBulkAction.ADD,
      ids: [ingredientId, testId('ingredient', 2)],
      tagId: firstTagId,
    };

    it('tags the selection as the caller, scoped to their organization and brand', async () => {
      const response = await controller.bulkTag(user, dto);

      expect(bulkRequests).toEqual([
        {
          action: TagBulkAction.ADD,
          editor: { brandId, userIds: [userId, 'user_123'] },
          ids: dto.ids,
          organizationId,
          tagId: firstTagId,
        },
      ]);
      expect(response).toEqual(bulkOutcome);
    });

    it('refreshes the cached Library list when something changed', async () => {
      await controller.bulkTag(user, dto);

      expect(invalidatedTags).toEqual([['ingredients']]);
    });

    it('leaves the cache alone when nothing changed', async () => {
      bulkOutcome = {
        changed: 0,
        failed: 0,
        failedIds: [],
        skipped: 2,
        skippedIds: dto.ids,
      };

      const response = await controller.bulkTag(user, dto);

      expect(invalidatedTags).toEqual([]);
      expect(response.skipped).toBe(2);
    });

    it('still answers when the cache is unavailable, and says so in the logs', async () => {
      isCacheDown = true;

      await expect(controller.bulkTag(user, dto)).resolves.toEqual(bulkOutcome);
      expect(warnings).toEqual([
        'IngredientsTagsController could not invalidate the Library list cache',
      ]);
    });

    it('lets a refused tag reach the caller', async () => {
      bulkOutcome = new Error('Tag not found');

      await expect(controller.bulkTag(user, dto)).rejects.toThrow(
        'Tag not found',
      );
      expect(invalidatedTags).toEqual([]);
    });
  });
});
