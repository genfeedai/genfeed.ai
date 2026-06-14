import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('IngredientsService', () => {
  let service: IngredientsService;
  let ingredientDelegate: {
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  let prisma: PrismaService;

  const mockIngredient = {
    _id: 'test-id',
    brand: 'test-object-id',
    id: 'test-id',
    isDeleted: false,
    metadata: 'metadata-id',
    organization: 'test-object-id',
    title: 'Test Ingredient',
    user: 'test-object-id',
  };

  beforeEach(async () => {
    ingredientDelegate = {
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(mockIngredient),
      findFirst: vi.fn().mockResolvedValue(mockIngredient),
      findMany: vi.fn().mockResolvedValue([mockIngredient]),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(mockIngredient),
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
        brand: 'test-object-id',
        status: 'pending',
      };

      const result = await service.create(createDto);

      expect(ingredientDelegate.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle creation errors', async () => {
      const createDto: CreateIngredientDto = {
        brand: 'test-object-id',
        status: 'pending',
      };

      const error = new Error('Creation failed');
      ingredientDelegate.create.mockRejectedValue(error);

      await expect(service.create(createDto)).rejects.toThrow(
        'Creation failed',
      );
    });
  });

  describe('findLatest', () => {
    it('should find latest ingredient for a user', async () => {
      const params = { user: 'user-id' };

      const result = await service.findLatest(params);

      expect(ingredientDelegate.findFirst).toHaveBeenCalled();
      expect(result).toBeDefined();
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
