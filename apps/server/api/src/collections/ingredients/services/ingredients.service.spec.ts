import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Ingredient (category/
// status/scope/etc enum fields) plus real, complete IngredientCategory/
// IngredientStatus/AssetScope enum value objects (used by
// normalizeEnumScalarValue → getPrismaEnumValues) via the light
// @genfeedai/prisma/testing subpath — no heavy PrismaClient/runtime import
// required for BaseService's getModelMeta('ingredient') call.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

describe('IngredientsService', () => {
  let service: IngredientsService;
  let ingredientDelegate: {
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  let prisma: PrismaService;

  const brandId = testId('brand');
  const ingredientId = testId('ingredient');
  const metadataId = testId('metadata');
  const organizationId = testId('org');
  const userId = testId('user');

  const mockIngredient = {
    brandId,
    id: ingredientId,
    isDeleted: false,
    metadataId,
    organizationId,
    title: 'Test Ingredient',
    userId,
  };

  beforeEach(async () => {
    ingredientDelegate = {
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockIngredient),
      findFirst: vi.fn().mockResolvedValue(mockIngredient),
      findMany: vi.fn().mockResolvedValue([mockIngredient]),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(mockIngredient),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };

    prisma = { ingredient: ingredientDelegate } as unknown as PrismaService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IngredientsService>(IngredientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an ingredient successfully', async () => {
      const createDto: CreateIngredientDto = {
        brandId,
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.PROCESSING,
      };

      const result = await service.create(createDto);

      expect(ingredientDelegate.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle creation errors', async () => {
      const createDto: CreateIngredientDto = {
        brandId,
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.PROCESSING,
      };

      const error = new Error('Creation failed');
      ingredientDelegate.create.mockRejectedValue(error);

      await expect(service.create(createDto)).rejects.toThrow(
        'Creation failed',
      );
    });

    it('writes canonical provenance and source relations', async () => {
      const sourceId = 'cmsource000000000000000001';

      await service.create({
        category: IngredientCategory.IMAGE,
        generationPrompt: 'A boxer in a dark arena',
        generationSeed: 42,
        modelUsed: 'black-forest-labs/flux-schnell',
        sources: [sourceId],
      });

      expect(ingredientDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationPrompt: 'A boxer in a dark arena',
            generationSeed: 42,
            modelUsed: 'black-forest-labs/flux-schnell',
            sources: { connect: [{ id: sourceId }] },
          }),
        }),
      );
    });
  });

  describe('patch', () => {
    it('should update an ingredient successfully', async () => {
      const id = 'test-id';
      const updateDto: UpdateIngredientDto = {
        isDeleted: false,
        status: IngredientStatus.GENERATED,
      };

      const result = await service.patch(id, updateDto);

      expect(ingredientDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id } }),
      );
      expect(result).toBeDefined();
    });

    it('normalizes app-form category to Prisma UPPERCASE before calling prisma.ingredient.update', async () => {
      const id = 'ing-1';
      // IngredientStatus.GENERATED = 'generated' (app-form lowercase)
      const updateDto: UpdateIngredientDto = {
        status: IngredientStatus.GENERATED, // 'generated' → should become 'GENERATED'
        category: IngredientCategory.VIDEO, // 'video' → should become 'VIDEO'
      };

      await service.patch(id, updateDto);

      expect(ingredientDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
          data: expect.objectContaining({
            status: 'GENERATED',
            category: 'VIDEO',
          }),
        }),
      );
    });

    it('normalizes kebab category image-edit to IMAGE_EDIT before calling prisma.ingredient.update', async () => {
      const id = 'ing-2';
      const updateDto: UpdateIngredientDto = {
        category: IngredientCategory.IMAGE_EDIT, // 'image-edit' → 'IMAGE_EDIT'
      };

      await service.patch(id, updateDto);

      expect(ingredientDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'IMAGE_EDIT' }),
        }),
      );
    });

    it('replaces source and tag relations with deduplicated canonical IDs', async () => {
      const sourceId = 'cmsource000000000000000001';
      const tagId = 'cmtag000000000000000000001';

      await service.patch('ingredient-1', {
        sources: [sourceId, sourceId],
        tags: [tagId, tagId],
      });

      expect(ingredientDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sources: { set: [{ id: sourceId }] },
            tags: { set: [{ id: tagId }] },
          }),
        }),
      );
    });

    it('clears source and tag relations when empty arrays are supplied', async () => {
      await service.patch('ingredient-1', { sources: [], tags: [] });

      expect(ingredientDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sources: { set: [] },
            tags: { set: [] },
          }),
        }),
      );
    });

    it('does not mutate source or tag relations when they are omitted', async () => {
      await service.patch('ingredient-1', { isFavorite: true });

      const update = ingredientDelegate.update.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(update.data).not.toHaveProperty('sources');
      expect(update.data).not.toHaveProperty('tags');
    });

    it('should handle update errors', async () => {
      const id = 'test-id';
      const updateDto: UpdateIngredientDto = {
        isDeleted: false,
        status: IngredientStatus.GENERATED,
      };

      const error = new Error('Update failed');
      ingredientDelegate.update.mockRejectedValue(error);

      await expect(service.patch(id, updateDto)).rejects.toThrow(
        'Update failed',
      );
    });
  });

  describe('patchAll', () => {
    it('rejects relation updates that Prisma updateMany cannot apply', async () => {
      const tagId = testId('tag');

      await expect(
        service.patchAll({ id: ingredientId }, { tags: [tagId] }),
      ).rejects.toThrow(
        'Bulk ingredient updates do not support sources or tags',
      );

      expect(ingredientDelegate.updateMany).not.toHaveBeenCalled();
    });

    it('keeps bulk writes on the canonical scalar boundary', async () => {
      ingredientDelegate.updateMany.mockResolvedValue({ count: 1 });

      await service.patchAll(
        { id: ingredientId },
        {
          brand: brandId,
          brandId,
          status: IngredientStatus.PROCESSING,
        },
      );

      expect(ingredientDelegate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            brandId,
            status: 'PROCESSING',
          }),
        }),
      );
      expect(ingredientDelegate.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ brand: expect.anything() }),
        }),
      );
    });
  });

  describe('patchAll', () => {
    it('normalizes app-form status to Prisma UPPERCASE before calling prisma.ingredient.updateMany', async () => {
      const updateManyMock = vi.fn().mockResolvedValue({ count: 2 });
      ingredientDelegate.updateMany = updateManyMock;

      await service.patchAll(
        { category: IngredientCategory.IMAGE }, // 'image' → 'IMAGE'
        { status: IngredientStatus.GENERATED }, // 'generated' → 'GENERATED'
      );

      expect(updateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'IMAGE' }),
          data: expect.objectContaining({ status: 'GENERATED' }),
        }),
      );
    });
  });

  describe('bulkSoftDeleteScoped', () => {
    let updateManyMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      updateManyMock = vi.fn().mockResolvedValue({ count: 0 });
      ingredientDelegate.updateMany = updateManyMock;
    });

    it('skips the database entirely for an empty id list', async () => {
      const result = await service.bulkSoftDeleteScoped({
        ids: [],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(result).toEqual({ deleted: [], failed: [] });
      expect(ingredientDelegate.findMany).not.toHaveBeenCalled();
      expect(updateManyMock).not.toHaveBeenCalled();
    });

    it('partitions owner-or-same-organization ids with one read and one write', async () => {
      ingredientDelegate.findMany.mockResolvedValue([
        { id: 'ing-1' },
        { id: 'ing-2' },
      ]);

      const result = await service.bulkSoftDeleteScoped({
        ids: ['ing-1', 'ing-2', 'ing-foreign'],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(ingredientDelegate.findMany).toHaveBeenCalledTimes(1);
      expect(ingredientDelegate.findMany).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: { in: ['ing-1', 'ing-2', 'ing-foreign'] },
          isDeleted: false,
          OR: [{ userId: 'user-1' }, { organizationId: 'org-1' }],
        },
      });
      expect(updateManyMock).toHaveBeenCalledTimes(1);
      expect(updateManyMock).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          id: { in: ['ing-1', 'ing-2'] },
          isDeleted: false,
          OR: [{ userId: 'user-1' }, { organizationId: 'org-1' }],
        },
      });
      expect(result).toEqual({
        deleted: ['ing-1', 'ing-2'],
        failed: ['ing-foreign'],
      });
    });

    it('reports ids the caller may not touch as failed without writing them', async () => {
      ingredientDelegate.findMany.mockResolvedValue([]);

      const result = await service.bulkSoftDeleteScoped({
        ids: ['ing-foreign'],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(updateManyMock).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: [], failed: ['ing-foreign'] });
    });

    it('deduplicates writes but still reports every requested id', async () => {
      ingredientDelegate.findMany.mockResolvedValue([{ id: 'ing-1' }]);

      const result = await service.bulkSoftDeleteScoped({
        ids: ['ing-1', 'ing-1'],
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(ingredientDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['ing-1'] } }),
        }),
      );
      expect(updateManyMock).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: expect.objectContaining({ id: { in: ['ing-1'] } }),
      });
      expect(result.deleted).toEqual(['ing-1', 'ing-1']);
    });
  });

  describe('findOne', () => {
    it('should find one ingredient', async () => {
      const params = { id: 'test-id' };

      const result = await service.findOne(params);

      expect(ingredientDelegate.findFirst).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should find all ingredients with pagination', async () => {
      ingredientDelegate.findMany.mockResolvedValue([mockIngredient]);
      ingredientDelegate.count.mockResolvedValue(1);

      const result = await service.findAll(
        { where: { isDeleted: false } },
        { limit: 10, page: 1 },
        false, // disable cache
      );

      expect(ingredientDelegate.findMany).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.docs).toHaveLength(1);
    });

    it('generates deterministic Prisma orderBy for public ingredients', async () => {
      ingredientDelegate.findMany.mockResolvedValue([]);
      ingredientDelegate.count.mockResolvedValue(0);

      await service.findAll(
        {
          orderBy: [{ createdAt: -1 }, { id: -1 }],
          where: {
            isDeleted: false,
            scope: AssetScope.PUBLIC,
            status: IngredientStatus.GENERATED,
          },
        },
        { limit: 15, page: 1 },
        false,
      );

      expect(ingredientDelegate.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 15,
        where: {
          isDeleted: false,
          scope: 'PUBLIC',
          status: 'GENERATED',
        },
      });
      expect(ingredientDelegate.count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          scope: 'PUBLIC',
          status: 'GENERATED',
        },
      });
    });
  });

  /**
   * Regression tests for #564 — category enum Prisma mapping.
   *
   * These verify that the app-form lowercase IngredientCategory values
   * (e.g. 'video', 'image-edit') are converted to Prisma UPPERCASE form
   * before being forwarded to prisma.ingredient.findMany / count.
   */
  describe('regression #564 — category enum mapping in direct Prisma queries', () => {
    // Re-use the ingredientDelegate already set up in the outer beforeEach;
    // just reset its mocks before each case so call counts are clean.
    let findManyMock: ReturnType<typeof vi.fn>;
    let countMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      findManyMock = vi.fn().mockResolvedValue([mockIngredient]);
      countMock = vi.fn().mockResolvedValue(1);
      ingredientDelegate.findMany = findManyMock;
      ingredientDelegate.count = countMock;
    });

    describe('findTopByVotes', () => {
      it('passes Prisma-form UPPERCASE category to prisma.ingredient.findMany when app-form VIDEO supplied', async () => {
        await service.findTopByVotes({
          category: IngredientCategory.VIDEO, // app-form: 'video'
          organizationId: 'org-1',
        });

        expect(findManyMock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ category: 'VIDEO' }),
          }),
        );
      });

      it('passes Prisma-form IMAGE_EDIT (hyphen→underscore) to prisma.ingredient.findMany', async () => {
        await service.findTopByVotes({
          category: IngredientCategory.IMAGE_EDIT, // app-form: 'image-edit'
          organizationId: 'org-1',
        });

        expect(findManyMock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ category: 'IMAGE_EDIT' }),
          }),
        );
      });

      it('omits category key when category is undefined', async () => {
        await service.findTopByVotes({ organizationId: 'org-1' });

        const callArg = findManyMock.mock.calls[0][0] as {
          where?: Record<string, unknown>;
        };
        expect(callArg.where).not.toHaveProperty('category');
      });
    });

    describe('getKPIMetrics', () => {
      it('passes Prisma-form UPPERCASE category to prisma.ingredient.count when app-form VIDEO supplied', async () => {
        // getKPIMetrics calls count multiple times; verify all calls carry UPPERCASE
        await service.getKPIMetrics('org-1', IngredientCategory.VIDEO);

        for (const [callArg] of countMock.mock.calls as Array<
          [{ where?: Record<string, unknown> }]
        >) {
          expect(callArg.where).toHaveProperty('category', 'VIDEO');
        }
      });

      it('omits category from where when no category is given', async () => {
        await service.getKPIMetrics('org-1');

        for (const [callArg] of countMock.mock.calls as Array<
          [{ where?: Record<string, unknown> }]
        >) {
          expect(callArg.where).not.toHaveProperty('category');
        }
      });
    });
  });
});
