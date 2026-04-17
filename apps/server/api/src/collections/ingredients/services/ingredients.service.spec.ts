import {
  Ingredient,
  type IngredientDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('IngredientsService', () => {
  let service: IngredientsService;

  const mockModel = {
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    collection: { name: 'ingredients' },
    countDocuments: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    modelName: 'Ingredient',
    populate: vi.fn(),
    updateMany: vi.fn(),
  } as Record<string, unknown>;

  const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  // Mock model as constructor
  const MockModelConstructor = vi
    .fn()
    .mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: vi.fn().mockResolvedValue({ _id: 'test-object-id', ...data }),
    }));

  beforeEach(async () => {
    Object.assign(MockModelConstructor, mockModel);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientsService,
        { provide: PrismaService, useValue: MockModelConstructor },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<IngredientsService>(IngredientsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an ingredient with create context populate', async () => {
      const createDto = {
        category: 'image',
        label: 'Test Ingredient',
        organization: 'test-object-id',
        user: 'test-object-id',
      };

      const savedIngredient = {
        _id: 'test-object-id',
        ...createDto,
      } as unknown as IngredientDocument;

      // Spy on super.create
      const superCreateSpy = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(service)), 'create')
        .mockResolvedValue(savedIngredient);

      const result = await service.create(
        createDto as Parameters<typeof service.create>[0],
      );

      expect(result).toBe(savedIngredient);
      expect(superCreateSpy).toHaveBeenCalledWith(
        createDto,
        expect.any(Array), // create context populate
      );
    });
  });

  describe('findLatest', () => {
    it('should find latest ingredient by version', async () => {
      const mockIngredient = {
        _id: 'test-object-id',
        label: 'Latest Ingredient',
        version: 3,
      } as unknown as IngredientDocument;

      const execMock = vi.fn().mockResolvedValue(mockIngredient);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      const sortMock = vi.fn().mockReturnValue({ populate: populateMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.findLatest({ parent: 'some-id' });

      expect(result).toBe(mockIngredient);
      expect(sortMock).toHaveBeenCalledWith({ version: -1 });
    });

    it('should return null when no ingredient found', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      const sortMock = vi.fn().mockReturnValue({ populate: populateMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.findLatest({ parent: 'nonexistent' });

      expect(result).toBeNull();
    });

    it('should throw and log on error', async () => {
      const error = new Error('DB error');
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw error;
      });

      await expect(service.findLatest({ parent: 'id' })).rejects.toThrow(
        'DB error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findChildren', () => {
    it('should find children of parent ingredient', async () => {
      const parentId = '507f1f77bcf86cd799439011';
      const mockChildren = [
        { _id: 'test-object-id', parent: parentId },
        { _id: 'test-object-id', parent: parentId },
      ];

      const execMock = vi.fn().mockResolvedValue(mockChildren);
      const limitMock = vi.fn().mockReturnValue({ exec: execMock });
      const populateMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findChildren(parentId);

      expect(result).toBe(mockChildren);
      expect(result).toHaveLength(2);
      expect(mockModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        parent: parentId,
      });
    });

    it('should use default limit of 100', async () => {
      const execMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ exec: execMock });
      const populateMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findChildren('507f1f77bcf86cd799439011');

      expect(limitMock).toHaveBeenCalledWith(100);
    });

    it('should enforce maximum limit of 500', async () => {
      const execMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ exec: execMock });
      const populateMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findChildren('507f1f77bcf86cd799439011', 1000);

      // Should be clamped to 500
      expect(limitMock).toHaveBeenCalledWith(500);
    });

    it('should respect custom limit below max', async () => {
      const execMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ exec: execMock });
      const populateMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findChildren('507f1f77bcf86cd799439011', 50);

      expect(limitMock).toHaveBeenCalledWith(50);
    });

    it('should throw and log on error', async () => {
      const error = new Error('Query failed');
      (mockModel.find as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw error;
      });

      await expect(
        service.findChildren('507f1f77bcf86cd799439011'),
      ).rejects.toThrow('Query failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findByIds', () => {
    it('should find ingredients by multiple IDs', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const ids = ['test-object-id', 'test-object-id'];
      const mockIngredients = ids.map((id) => ({
        _id: id,
        label: 'Test',
      }));

      const execMock = vi.fn().mockResolvedValue(mockIngredients);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      const result = await service.findByIds(ids, orgId);

      expect(result).toBe(mockIngredients);
      expect(result).toHaveLength(2);
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: expect.any(Array) },
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
    });

    it('should return empty array for empty ids', async () => {
      const result = await service.findByIds([], '507f1f77bcf86cd799439011');

      expect(result).toEqual([]);
    });

    it('should handle string IDs', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const ids = ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'];

      const execMock = vi.fn().mockResolvedValue([]);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findByIds(ids, orgId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: {
            $in: expect.arrayContaining([expect.any(string)]),
          },
        }),
      );
    });

    it('should handle ObjectId organization param', async () => {
      const orgId = 'test-object-id';
      const ids = ['test-object-id'];

      const execMock = vi.fn().mockResolvedValue([]);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        populate: populateMock,
      });

      await service.findByIds(ids, orgId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: orgId,
        }),
      );
    });

    it('should throw and log on error', async () => {
      const error = new Error('DB error');
      (mockModel.find as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw error;
      });

      await expect(
        service.findByIds(['test-object-id'], '507f1f77bcf86cd799439011'),
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findApprovedImagesByCampaign', () => {
    it('should find approved campaign images scoped to organization and brand', async () => {
      const organizationId = '507f1f77bcf86cd799439011';
      const brandId = '507f1f77bcf86cd799439012';
      const campaign = 'spring-drop';
      const mockIngredients = [
        { _id: 'test-object-id', campaign },
        { _id: 'test-object-id', campaign },
      ];

      const execMock = vi.fn().mockResolvedValue(mockIngredients);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      const sortMock = vi.fn().mockReturnValue({ populate: populateMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.findApprovedImagesByCampaign(
        campaign,
        organizationId,
        brandId,
      );

      expect(result).toBe(mockIngredients);
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(string),
          campaign,
          category: 'image',
          isDeleted: false,
          organization: expect.any(string),
          reviewStatus: 'approved',
          status: {
            $in: ['generated', 'validated'],
          },
        }),
      );
      expect(sortMock).toHaveBeenCalledWith({ _id: 1, createdAt: 1 });
    });

    it('should throw and log on error', async () => {
      const error = new Error('Campaign query failed');
      (mockModel.find as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw error;
      });

      await expect(
        service.findApprovedImagesByCampaign(
          'spring-drop',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439012',
        ),
      ).rejects.toThrow('Campaign query failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should find ingredient with model lookup aggregation', async () => {
      const ingredientId = 'test-object-id';
      const mockIngredient = {
        _id: ingredientId,
        category: 'image',
        modelLabel: 'SDXL',
      };

      const execMock = vi.fn().mockResolvedValue([mockIngredient]);
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.findOne({ _id: ingredientId });

      expect(result).toBe(mockIngredient);
      expect(mockModel.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.any(Object) }),
          expect.objectContaining({ $limit: 1 }),
        ]),
      );
    });

    it('should return null when not found', async () => {
      const execMock = vi.fn().mockResolvedValue([]);
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.findOne({ _id: 'test-object-id' });

      expect(result).toBeNull();
    });

    it('should convert string _id to ObjectId in match', async () => {
      const idStr = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue([]);
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      await service.findOne({ _id: idStr });

      const pipeline = (mockModel.aggregate as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      const matchStage = pipeline.find(
        (s: Record<string, unknown>) => '$match' in s,
      );
      expect(matchStage.$match._id).toBeInstanceOf(string);
    });

    it('should populate when populate options are provided', async () => {
      const mockDoc = { _id: 'test-object-id', category: 'image' };
      const execMock = vi.fn().mockResolvedValue([mockDoc]);
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const populatedDoc = { ...mockDoc, brand: { _id: 'test-object-id' } };
      (mockModel.populate as ReturnType<typeof vi.fn>).mockResolvedValue(
        populatedDoc,
      );

      const result = await service.findOne({ _id: mockDoc._id }, [
        { path: 'brand', select: '_id' },
      ]);

      expect(result).toBe(populatedDoc);
      expect(mockModel.populate).toHaveBeenCalled();
    });
  });

  describe('patch', () => {
    it('should update and re-fetch with model lookup', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto = { label: 'Updated' };

      // Mock super.patch (findByIdAndUpdate)
      const updatedDoc = {
        _id: new string(id),
        label: 'Updated',
      } as unknown as IngredientDocument;

      const execMock = vi.fn().mockResolvedValue(updatedDoc);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          populate: populateMock,
        },
      );

      // Mock findOne (re-fetch with model lookup)
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(updatedDoc);

      const result = await service.patch(id, updateDto);

      expect(result).toBe(updatedDoc);
      expect(findOneSpy).toHaveBeenCalledWith({ _id: id }, expect.any(Array));
    });

    it('should throw NotFoundException when not found', async () => {
      const id = '507f1f77bcf86cd799439099';
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue(
        {
          populate: populateMock,
        },
      );

      await expect(service.patch(id, { label: 'test' })).rejects.toThrow();
    });
  });

  describe('patchAll', () => {
    it('should bulk update ingredients', async () => {
      const execMock = vi.fn().mockResolvedValue({
        matchedCount: 3,
        modifiedCount: 3,
      });
      (mockModel.updateMany as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.patchAll(
        { isDeleted: false },
        { $set: { status: 'validated' } },
      );

      expect(result.modifiedCount).toBe(3);
    });
  });

  describe('findAll', () => {
    it('should enhance pipeline with model lookup', async () => {
      const aggregate = [{ $match: { isDeleted: false } }];
      const options = { limit: 20, page: 1 };

      const mockResult = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      };

      // Spy on super.findAll
      const superFindAllSpy = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(service)), 'findAll')
        .mockResolvedValue(mockResult);

      const result = await service.findAll(aggregate, options);

      expect(result).toBe(mockResult);
      // The enhanced aggregate should have more stages than the original
      const enhancedPipeline = superFindAllSpy.mock.calls[0][0];
      expect(enhancedPipeline.length).toBeGreaterThan(aggregate.length);
    });
  });

  describe('getKPIMetrics', () => {
    it('should return KPI metrics for a specific category', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const execMock = vi
        .fn()
        .mockResolvedValue([
          { _id: null, generated: 50, rejected: 10, total: 80, validated: 20 },
        ]);
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.getKPIMetrics(orgId, 'image');

      expect(result.total).toBe(80);
      expect(result.generated).toBe(50);
      expect(result.rejected).toBe(10);
      expect(result.validated).toBe(20);
    });

    it('should return all categories KPI metrics with breakdown', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue([
        { _id: 'image', generated: 30, rejected: 5, total: 45, validated: 10 },
        { _id: 'video', generated: 20, rejected: 3, total: 30, validated: 7 },
      ]);
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.getKPIMetrics(orgId);

      expect(result.total).toBe(75);
      expect(result.generated).toBe(50);
      expect(result.byCategory).toBeDefined();
      expect(result.byCategory?.image.generated).toBe(30);
      expect(result.byCategory?.video.generated).toBe(20);
    });

    it('should return zeros when no data', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue([]);
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: execMock,
      });

      const result = await service.getKPIMetrics(orgId, 'image');

      expect(result.total).toBe(0);
      expect(result.generated).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.validated).toBe(0);
    });

    it('should throw and log on error', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const error = new Error('Aggregation failed');
      (mockModel.aggregate as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
      });

      await expect(service.getKPIMetrics(orgId)).rejects.toThrow(
        'Aggregation failed',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
