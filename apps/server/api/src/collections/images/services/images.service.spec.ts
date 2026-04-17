import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { type Ingredient } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ImagesService', () => {
  let service: ImagesService;
  let mockModel: ReturnType<typeof createMockModel>;
  let mockLogger: vi.Mocked<LoggerService>;

  const mockImageDocument = {
    _id: 'test-object-id',
    brand: 'test-object-id',
    category: IngredientCategory.IMAGE,
    createdAt: new Date(),
    exec: vi.fn().mockResolvedValue(this),
    height: 1080,
    isDeleted: false,
    metadata: 'test-object-id',
    organization: 'test-object-id',
    populate: vi.fn().mockReturnThis(),
    save: vi.fn().mockResolvedValue(this),
    status: IngredientStatus.PROCESSING,
    tags: [],
    thumbnail: 'https://example.com/thumb.jpg',
    updatedAt: new Date(),
    url: 'https://example.com/image.jpg',
    user: 'test-object-id',
    version: 1,
    width: 1920,
  };

  beforeEach(async () => {
    mockModel = vi.fn().mockImplementation(function (
      createDto: Record<string, unknown>,
    ) {
      return {
        ...createDto,
        save: vi.fn().mockResolvedValue(mockImageDocument),
      };
    });

    mockModel.collection = { name: 'ingredients' };
    mockModel.modelName = 'Ingredient';

    mockModel.aggregate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([mockImageDocument]),
    });
    mockModel.aggregatePaginate = vi.fn().mockResolvedValue({
      docs: [mockImageDocument],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 10,
      page: 1,
      totalDocs: 1,
      totalPages: 1,
    });
    mockModel.countDocuments = vi.fn().mockResolvedValue(1);
    mockModel.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 1 });
    mockModel.find = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([mockImageDocument]),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findById = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockImageDocument),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockImageDocument),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findOne = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockImageDocument),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
    });
    mockModel.populate = vi.fn().mockResolvedValue(mockImageDocument);
    mockModel.updateMany = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    });

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImagesService,
        { provide: PrismaService, useValue: mockModel },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ImagesService>(ImagesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should extend IngredientsService', () => {
      expect(service).toBeInstanceOf(IngredientsService);
    });

    it('should have model and logger properties', () => {
      expect(service.model).toBeDefined();
      expect(service.logger).toBeDefined();
    });
  });

  describe('create', () => {
    const createDto = {
      brand: 'test-object-id'.toString(),
      category: IngredientCategory.IMAGE,
      organization: 'test-object-id'.toString(),
      url: 'https://example.com/new-image.jpg',
      user: 'test-object-id'.toString(),
    };

    it('should create a new image document successfully', async () => {
      const result = await service.create(createDto);

      expect(result).toEqual(mockImageDocument);
      expect(mockModel).toHaveBeenCalledWith(createDto);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('create'),
        expect.objectContaining({ createDto }),
      );
    });

    it('should handle creation errors', async () => {
      const error = new Error('Database error');
      mockModel.mockImplementationOnce(function () {
        return { save: vi.fn().mockRejectedValue(error) };
      });

      await expect(service.create(createDto)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should apply correct population context for created documents', async () => {
      const mockPopulatedDoc = {
        ...mockImageDocument,
        user: { name: 'Test User' },
      };
      mockModel.findById = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockPopulatedDoc),
        }),
      });

      const result = await service.create(createDto);

      expect(result).toEqual(mockPopulatedDoc);
      expect(mockModel).toHaveBeenCalled();
    });
  });

  describe('findLatest', () => {
    const params = {
      category: IngredientCategory.IMAGE,
      user: 'test-object-id',
    };

    it('should find the latest image by version', async () => {
      const result = await service.findLatest(params);

      expect(result).toEqual(mockImageDocument);
      expect(mockModel.findOne).toHaveBeenCalledWith(params);
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });

    it('should return null when no image is found', async () => {
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });

      const result = await service.findLatest(params);

      expect(result).toBeNull();
    });

    it('should handle findLatest errors', async () => {
      const error = new Error('Query failed');
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });

      await expect(service.findLatest(params)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findChildren', () => {
    const parentId = 'test-object-id'.toString();

    it('should find all child images for a parent', async () => {
      const mockChildren = [
        mockImageDocument,
        { ...mockImageDocument, _id: 'test-object-id' },
      ];
      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockChildren),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findChildren(parentId);

      expect(result).toEqual(mockChildren);
      expect(mockModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        parent: parentId,
      });
    });

    it('should return empty array when no children found', async () => {
      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findChildren(parentId);

      expect(result).toEqual([]);
    });

    it('should handle findChildren errors', async () => {
      const error = new Error('Query failed');
      mockModel.find.mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(service.findChildren(parentId)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    const params = { _id: 'test-object-id' };

    it('should find one image with default population', async () => {
      const result = await service.findOne(params);

      expect(result).toEqual(mockImageDocument);
      expect(mockModel.aggregate).toHaveBeenCalled();
    });

    it('should find one image with custom population', async () => {
      const customPopulate = [{ path: 'user', select: 'name email' }];

      const result = await service.findOne(params, customPopulate);

      expect(result).toEqual(mockImageDocument);
      expect(mockModel.aggregate).toHaveBeenCalled();
    });

    it('should return null when image not found', async () => {
      mockModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.findOne(params);

      expect(result).toBeNull();
    });
  });

  describe('patch', () => {
    const id = 'test-object-id'.toString();
    const updateDto = {
      status: IngredientStatus.GENERATED,
      url: 'https://example.com/updated.jpg',
    };

    it('should update an image successfully', async () => {
      const result = await service.patch(id, updateDto);

      expect(result).toEqual(mockImageDocument);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: updateDto },
        { returnDocument: 'after' },
      );
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(service.patch(id, updateDto)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should apply custom population on update', async () => {
      const customPopulate = [PopulatePatterns.userMinimal];

      const result = await service.patch(id, updateDto, customPopulate);

      expect(result).toEqual(mockImageDocument);
    });
  });

  describe('patchAll', () => {
    const filter = { status: IngredientStatus.PROCESSING };
    const update = { status: IngredientStatus.GENERATED };

    it('should update multiple images successfully', async () => {
      const result = await service.patchAll(filter, update);

      expect(result).toEqual({ modifiedCount: 1 });
      expect(mockModel.updateMany).toHaveBeenCalledWith(filter, update);
    });

    it('should return zero modified count when no matches', async () => {
      mockModel.updateMany.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      });

      const result = await service.patchAll(filter, update);

      expect(result).toEqual({ modifiedCount: 0 });
    });

    it('should handle bulk update errors', async () => {
      const error = new Error('Bulk update failed');
      mockModel.updateMany.mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
      });

      await expect(service.patchAll(filter, update)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Population Context', () => {
    it('should use minimal population for list context', async () => {
      const params = { isDeleted: false };
      await service.findOne(params);

      expect(mockModel.aggregate).toHaveBeenCalled();
    });

    it('should use detailed population for detail context', async () => {
      const params = { _id: 'test-object-id' };
      await service.findOne(params);

      expect(mockModel.aggregate).toHaveBeenCalled();
    });

    it('should handle missing population gracefully', async () => {
      const params = { _id: 'test-object-id' };
      mockModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockImageDocument]),
      });

      const result = await service.findOne(params);

      expect(result).toEqual(mockImageDocument);
    });
  });

  describe('Error Handling', () => {
    it('should log and rethrow database connection errors', async () => {
      const dbError = new Error('Connection refused');
      mockModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockRejectedValue(dbError),
      });

      await expect(service.findOne({})).rejects.toThrow(dbError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle validation errors in create', async () => {
      const validationError = new Error('Validation failed');
      mockModel.mockImplementationOnce(function () {
        return { save: vi.fn().mockRejectedValue(validationError) };
      });

      await expect(service.create({})).rejects.toThrow(validationError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle timeout errors gracefully', async () => {
      const timeoutError = new Error('Operation timeout');
      mockModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockRejectedValue(timeoutError),
      });

      await expect(service.findOne({})).rejects.toThrow(timeoutError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty update object in patch', async () => {
      const id = 'test-object-id'.toString();
      const emptyUpdate = {};

      const result = await service.patch(id, emptyUpdate);

      expect(result).toEqual(mockImageDocument);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: emptyUpdate },
        { returnDocument: 'after' },
      );
    });

    it('should handle invalid ObjectId in findChildren', async () => {
      const invalidId = 'invalid-id';
      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findChildren(invalidId);

      expect(result).toEqual([]);
    });

    it('should handle null parameters in findLatest', async () => {
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });

      const result = await service.findLatest(null);

      expect(result).toBeNull();
    });

    it('should handle concurrent patch operations', async () => {
      const id = 'test-object-id'.toString();
      const updates = [
        { status: IngredientStatus.PROCESSING },
        { status: IngredientStatus.GENERATED },
      ];

      const promises = updates.map((update) => service.patch(id, update));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });
  });
});
