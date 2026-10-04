vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn(() => {
    throw new Error('not found');
  }),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsTagsController } from '@api/collections/ingredients/controllers/ingredients-tags.controller';
import type { BulkTagIngredientsDto } from '@api/collections/ingredients/dto/bulk-tag-ingredients.dto';
import type { IngredientTagsService } from '@api/collections/ingredients/services/ingredient-tags.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { CacheService } from '@api/services/cache/cache.service';
import { TagBulkAction } from '@genfeedai/contracts';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

describe('IngredientsTagsController', () => {
  const organizationId = testId('org');
  const brandId = testId('brand');
  const userId = testId('user');
  const ingredientId = testId('ingredient');
  const [firstTagId, secondTagId] = testIds('tag', 2);
  const user = { brandId, id: 'user_123', organizationId, userId } as User;
  const request = { originalUrl: '/api/ingredients' } as Request;

  const ingredientsService = {
    assertClientTags: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const ingredientTagsService = { bulkSetTag: vi.fn() };
  const cacheService = { invalidateByTags: vi.fn() };
  const logger = { warn: vi.fn() };
  const moduleRef = {
    get: vi.fn((token: unknown) =>
      token === CacheService ? cacheService : undefined,
    ),
  };

  const controller = new IngredientsTagsController(
    ingredientsService as unknown as IngredientsService,
    ingredientTagsService as unknown as IngredientTagsService,
    logger as unknown as LoggerService,
    moduleRef as unknown as ModuleRef,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    ingredientsService.assertClientTags.mockResolvedValue(undefined);
    ingredientsService.findOne.mockResolvedValue({
      brandId,
      id: ingredientId,
      organizationId,
    });
    ingredientsService.patch.mockResolvedValue({ id: ingredientId });
    cacheService.invalidateByTags.mockResolvedValue(1);
  });

  it('keeps the single-asset tag route behind the asset access guard', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      IngredientsTagsController.prototype.updateTags,
    ) as unknown[];

    expect(guards).toContain(AssetAccessGuard);
  });

  describe('updateTags', () => {
    it('sets the asset’s tags once the brand can use them', async () => {
      const response = await controller.updateTags(
        request,
        ingredientId,
        user,
        { tags: [firstTagId, secondTagId] },
      );

      expect(ingredientsService.assertClientTags).toHaveBeenCalledWith(
        [firstTagId, secondTagId],
        organizationId,
        brandId,
      );
      expect(ingredientsService.patch).toHaveBeenCalledWith(
        ingredientId,
        { tags: [firstTagId, secondTagId] },
        [{ path: 'tags' }],
      );
      expect(response).toEqual({ data: { id: ingredientId } });
    });

    it('looks the asset up inside the caller’s organization only', async () => {
      await controller.updateTags(request, ingredientId, user, { tags: [] });

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: ingredientId,
          isDeleted: false,
          organizationId,
        }),
      );
    });

    it('does not write when a tag is refused', async () => {
      ingredientsService.assertClientTags.mockRejectedValue(
        new Error('Tags must belong to the asset brand'),
      );

      await expect(
        controller.updateTags(request, ingredientId, user, {
          tags: [firstTagId],
        }),
      ).rejects.toThrow('Tags must belong');
      expect(ingredientsService.patch).not.toHaveBeenCalled();
    });

    it('answers not found for an asset outside the organization', async () => {
      ingredientsService.findOne.mockResolvedValue(null);

      await expect(
        controller.updateTags(request, ingredientId, user, { tags: [] }),
      ).rejects.toThrow('not found');
      expect(ingredientsService.assertClientTags).not.toHaveBeenCalled();
      expect(ingredientsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('bulkTag', () => {
    const dto: BulkTagIngredientsDto = {
      action: TagBulkAction.ADD,
      ids: [ingredientId, testId('ingredient', 2)],
      tagId: firstTagId,
    };
    const result = {
      changed: 2,
      failed: 0,
      failedIds: [],
      skipped: 0,
      skippedIds: [],
    };

    it('tags the selection as the caller, scoped to their organization and brand', async () => {
      ingredientTagsService.bulkSetTag.mockResolvedValue(result);

      const response = await controller.bulkTag(user, dto);

      expect(ingredientTagsService.bulkSetTag).toHaveBeenCalledWith({
        action: TagBulkAction.ADD,
        editor: { brandId, userIds: [userId, 'user_123'] },
        ids: dto.ids,
        organizationId,
        tagId: firstTagId,
      });
      expect(response).toEqual(result);
    });

    it('refreshes the cached Library list when something changed', async () => {
      ingredientTagsService.bulkSetTag.mockResolvedValue(result);

      await controller.bulkTag(user, dto);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'ingredients',
      ]);
    });

    it('leaves the cache alone when nothing changed', async () => {
      ingredientTagsService.bulkSetTag.mockResolvedValue({
        ...result,
        changed: 0,
        skipped: 2,
        skippedIds: dto.ids,
      });

      const response = await controller.bulkTag(user, dto);

      expect(cacheService.invalidateByTags).not.toHaveBeenCalled();
      expect(response.skipped).toBe(2);
    });

    it('still answers when the cache is unavailable', async () => {
      ingredientTagsService.bulkSetTag.mockResolvedValue(result);
      cacheService.invalidateByTags.mockRejectedValue(new Error('redis down'));

      await expect(controller.bulkTag(user, dto)).resolves.toEqual(result);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('lets a refused tag reach the caller', async () => {
      ingredientTagsService.bulkSetTag.mockRejectedValue(
        new Error('Tag not found'),
      );

      await expect(controller.bulkTag(user, dto)).rejects.toThrow(
        'Tag not found',
      );
    });
  });
});
