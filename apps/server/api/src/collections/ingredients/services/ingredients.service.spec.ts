import type { IngredientServerCreate } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetScope,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import {
  crossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
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
      const createDto: IngredientServerCreate = {
        brandId,
        category: IngredientCategory.IMAGE,
        origin: IngredientOrigin.GENERATED,
        status: IngredientStatus.PROCESSING,
      };

      const result = await service.create(createDto);

      expect(ingredientDelegate.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle creation errors', async () => {
      const createDto: IngredientServerCreate = {
        brandId,
        category: IngredientCategory.IMAGE,
        origin: IngredientOrigin.GENERATED,
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
        origin: IngredientOrigin.GENERATED,
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

  describe('origin', () => {
    it.each([
      IngredientOrigin.UPLOADED,
      IngredientOrigin.GENERATED,
      IngredientOrigin.IMPORTED,
    ])('persists %s on create', async (origin) => {
      await service.create({
        category: IngredientCategory.IMAGE,
        origin,
        status: IngredientStatus.PROCESSING,
      });

      expect(ingredientDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ origin }),
        }),
      );
    });

    it('never writes origin on a patch, even when asked', async () => {
      await service.patch(ingredientId, {
        origin: IngredientOrigin.IMPORTED,
        status: IngredientStatus.VALIDATED,
      } as Parameters<IngredientsService['patch']>[1]);

      const [{ data }] = ingredientDelegate.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(data).not.toHaveProperty('origin');
      expect(data).toHaveProperty('status');
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
        expect.objectContaining({
          where: { id, organizationId, isDeleted: false },
        }),
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
          where: { id, organizationId, isDeleted: false },
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
          where: expect.objectContaining({
            AND: [expect.objectContaining({ category: 'IMAGE' })],
            organizationId,
            isDeleted: false,
          }),
          data: expect.objectContaining({ status: 'GENERATED' }),
        }),
      );
    });
  });

  describe('request tenant scope (CLOUD tenant guard)', () => {
    const guard =
      (operation: string) =>
      (args: unknown): void =>
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'Ingredient',
          operation,
          tenantModelNames: new Set(['Ingredient']),
        });

    beforeEach(() => {
      ingredientDelegate.findFirst.mockImplementation(async (args) => {
        guard('findFirst')(args);
        return mockIngredient;
      });
      ingredientDelegate.findMany.mockImplementation(async (args) => {
        guard('findMany')(args);
        return [mockIngredient];
      });
      ingredientDelegate.update.mockImplementation(async (args) => {
        guard('update')(args);
        return mockIngredient;
      });
      ingredientDelegate.updateMany.mockImplementation(async (args) => {
        guard('updateMany')(args);
        return { count: 1 };
      });
    });

    it('patches an ingredient under the request organization and re-reads it there', async () => {
      await runWithTenantContext({ organizationId }, () =>
        service.patch('ing-1', { status: IngredientStatus.PROCESSING }),
      );

      const lookups = ingredientDelegate.findFirst.mock.calls.map(
        ([args]) => args.where,
      );
      expect(lookups).toHaveLength(2);
      for (const where of lookups) {
        expect(where).toMatchObject({ id: 'ing-1', organizationId });
      }
      expect(ingredientDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ing-1', isDeleted: false, organizationId },
        }),
      );
    });

    it('does not reach a foreign organization row through patch', async () => {
      ingredientDelegate.findFirst.mockImplementation(async (args) => {
        guard('findFirst')(args);
        return args.where.organizationId === organizationId
          ? null
          : mockIngredient;
      });

      await expect(
        runWithTenantContext({ organizationId }, () =>
          service.patch('ing-1', { status: IngredientStatus.PROCESSING }),
        ),
      ).rejects.toThrow('Ingredient');
      expect(ingredientDelegate.update).not.toHaveBeenCalled();
    });

    it('keeps the id-keyed shape for workers that carry no tenant context', async () => {
      ingredientDelegate.findFirst.mockResolvedValue(mockIngredient);

      await service.patch('ing-1', { status: IngredientStatus.PROCESSING });

      for (const [args] of ingredientDelegate.findFirst.mock.calls) {
        expect(args.where).not.toHaveProperty('organizationId');
      }
    });

    it('soft-deletes under the request organization', async () => {
      await runWithTenantContext({ organizationId }, () =>
        service.remove('ing-1'),
      );

      expect(ingredientDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isDeleted: true },
          where: { id: 'ing-1', isDeleted: false, organizationId },
        }),
      );
    });

    it('soft-deletes by id for workers and explicit cross-organization callers', async () => {
      await service.remove('ing-1');
      await runWithTenantContext({ organizationId }, () =>
        crossOrgUnsafe(async () => await service.remove('ing-2')),
      );

      expect(ingredientDelegate.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { id: 'ing-1' } }),
      );
      expect(ingredientDelegate.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { id: 'ing-2' } }),
      );
    });

    it('never writes platform rows from a request, only the tenant-owned ones', async () => {
      ingredientDelegate.findMany.mockResolvedValue([
        { ...mockIngredient, organizationId: null },
        mockIngredient,
      ]);

      const result = await runWithTenantContext({ organizationId }, () =>
        service.patchAll(
          { category: IngredientCategory.IMAGE, organizationId },
          { status: IngredientStatus.PROCESSING },
        ),
      );

      expect(ingredientDelegate.updateMany).toHaveBeenCalledTimes(1);
      expect(ingredientDelegate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId }),
        }),
      );
      expect(result.modifiedCount).toBe(1);
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

    it('falls back to the metadata link for external media without a key', async () => {
      ingredientDelegate.findFirst.mockResolvedValueOnce({
        ...mockIngredient,
        cdnUrl: null,
        metadata: { result: 'https://cdn.argil.ai/video-1.mp4' },
        s3Key: null,
      });

      const result = await service.findOne({ id: 'test-id' });

      expect(result?.cdnUrl).toBe('https://cdn.argil.ai/video-1.mp4');
    });
  });

  describe('listLibraryAssets', () => {
    it('always scopes by organizationId and isDeleted:false, newest first', async () => {
      await service.listLibraryAssets({
        category: IngredientCategory.IMAGE,
        limit: 5,
        offset: 10,
        organizationId,
        origin: IngredientOrigin.UPLOADED,
      });

      expect(ingredientDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          skip: 10,
          take: 5,
          where: {
            category: IngredientCategory.IMAGE,
            isDeleted: false,
            organizationId,
            origin: IngredientOrigin.UPLOADED,
            status: {
              notIn: [
                IngredientStatus.FAILED,
                IngredientStatus.ARCHIVED,
                IngredientStatus.REJECTED,
              ],
            },
            trainingId: null,
          },
        }),
      );
    });

    it('adds the brand filter for a brand-scoped caller', async () => {
      await service.listLibraryAssets({
        brandId: 'brand-1',
        category: IngredientCategory.IMAGE,
        limit: 10,
        offset: 0,
        organizationId,
      });

      const arg = ingredientDelegate.findMany.mock.calls.at(-1)?.[0] as {
        where: Record<string, unknown>;
      };
      expect(arg.where).toMatchObject({
        brandId: 'brand-1',
        isDeleted: false,
        organizationId,
      });
    });

    it('applies a tag filter inside the tenant scope and loads each asset’s tags', async () => {
      const tagFilter = { tags: { some: { id: 'tag-1', isDeleted: false } } };

      await service.listLibraryAssets({
        category: IngredientCategory.IMAGE,
        limit: 10,
        offset: 0,
        organizationId,
        tagFilter,
      });

      const arg = ingredientDelegate.findMany.mock.calls.at(-1)?.[0] as {
        include: Record<string, unknown>;
        where: Record<string, unknown>;
      };
      expect(arg.where).toMatchObject({
        ...tagFilter,
        isDeleted: false,
        organizationId,
      });
      expect(arg.include).toMatchObject({
        metadata: { select: { result: true } },
        tags: { where: { isDeleted: false } },
      });
    });

    it('omits the origin filter when none is given', async () => {
      await service.listLibraryAssets({
        category: IngredientCategory.VIDEO,
        limit: 10,
        offset: 0,
        organizationId,
      });

      const arg = ingredientDelegate.findMany.mock.calls.at(-1)?.[0] as {
        where: Record<string, unknown>;
      };
      expect(arg.where).not.toHaveProperty('origin');
      expect(arg.where).toMatchObject({ isDeleted: false, organizationId });
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
