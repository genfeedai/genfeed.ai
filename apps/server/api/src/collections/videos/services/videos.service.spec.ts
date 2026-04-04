import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('VideosService', () => {
  let service: VideosService;
  let mockModel: ReturnType<typeof createMockModel>;
  let mockLogger: vi.Mocked<LoggerService>;

  const mockVideoDocument = {
    _id: new Types.ObjectId(),
    brand: new Types.ObjectId(),
    category: IngredientCategory.VIDEO,
    createdAt: new Date(),
    duration: 120,
    exec: vi.fn().mockResolvedValue(this),
    fps: 30,
    height: 1080,
    isDeleted: false,
    metadata: new Types.ObjectId(),
    organization: new Types.ObjectId(),
    populate: vi.fn().mockReturnThis(),
    save: vi.fn().mockResolvedValue(this),
    status: IngredientStatus.PROCESSING,
    tags: [],
    thumbnail: 'https://example.com/video-thumb.jpg',
    updatedAt: new Date(),
    url: 'https://example.com/video.mp4',
    user: new Types.ObjectId(),
    version: 1,
    width: 1920,
  };

  beforeEach(async () => {
    mockModel = vi.fn().mockImplementation(function () {
      return {
        ...mockVideoDocument,
        save: vi.fn().mockResolvedValue(mockVideoDocument),
      };
    });

    mockModel.collection = { name: 'ingredients' };
    mockModel.modelName = 'Ingredient';

    mockModel.aggregate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([mockVideoDocument]),
    });
    mockModel.aggregatePaginate = vi.fn().mockResolvedValue({
      docs: [mockVideoDocument],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 10,
      page: 1,
      totalDocs: 1,
      totalPages: 1,
    });
    mockModel.countDocuments = vi.fn().mockResolvedValue(1);
    mockModel.create = vi.fn();
    mockModel.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 1 });
    mockModel.find = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([mockVideoDocument]),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findById = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockVideoDocument),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findByIdAndDelete = vi.fn().mockResolvedValue(mockVideoDocument);
    mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockVideoDocument),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findOne = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockVideoDocument),
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
    });
    mockModel.populate = vi.fn().mockResolvedValue(mockVideoDocument);
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
        VideosService,
        {
          provide: getModelToken(Ingredient.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<VideosService>(VideosService);
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
      brand: new Types.ObjectId().toString(),
      category: IngredientCategory.VIDEO,
      duration: 90,
      organization: new Types.ObjectId().toString(),
      url: 'https://example.com/new-video.mp4',
      user: new Types.ObjectId().toString(),
    };

    it('should create a new video document successfully', async () => {
      const result = await service.create(createDto);

      expect(result).toEqual(mockVideoDocument);
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

    it('should validate video-specific fields', async () => {
      const invalidDto = { ...createDto, duration: -1 };
      const error = new Error('Validation failed');

      mockModel.mockImplementationOnce(function () {
        return { save: vi.fn().mockRejectedValue(error) };
      });

      await expect(service.create(invalidDto)).rejects.toThrow(
        'Validation failed',
      );
    });
  });

  describe('findLatest', () => {
    const params = {
      category: IngredientCategory.VIDEO,
      user: new Types.ObjectId(),
    };

    it('should find the latest video by version', async () => {
      const result = await service.findLatest(params);

      expect(result).toEqual(mockVideoDocument);
      expect(mockModel.findOne).toHaveBeenCalledWith(params);
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });

    it('should return null when no video is found', async () => {
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
    const parentId = new Types.ObjectId().toString();

    it('should find all child videos for a parent', async () => {
      const mockChildren = [
        mockVideoDocument,
        { ...mockVideoDocument, _id: new Types.ObjectId() },
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
  });

  describe('findOne', () => {
    const params = { _id: new Types.ObjectId() };

    it('should find one video with default population', async () => {
      const result = await service.findOne(params);

      expect(result).toEqual(mockVideoDocument);
      expect(mockModel.aggregate).toHaveBeenCalledWith(expect.any(Array));
      expect(mockModel.populate).not.toHaveBeenCalled();
    });

    it('should find one video with custom population', async () => {
      const customPopulate = [{ path: 'brand', select: 'name' }];

      const result = await service.findOne(params, customPopulate);

      expect(result).toEqual(mockVideoDocument);
      expect(mockModel.aggregate).toHaveBeenCalledWith(expect.any(Array));
      expect(mockModel.populate).toHaveBeenCalledWith(
        mockVideoDocument,
        customPopulate,
      );
    });

    it('should return null when video not found', async () => {
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.findOne(params);

      expect(result).toBeNull();
    });
  });

  describe('patch', () => {
    const id = new Types.ObjectId().toString();
    const updateDto = {
      duration: 150,
      status: IngredientStatus.GENERATED,
      url: 'https://example.com/updated-video.mp4',
    };

    it('should update a video successfully', async () => {
      const result = await service.patch(id, updateDto);

      expect(result).toEqual(mockVideoDocument);
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

      expect(result).toEqual(mockVideoDocument);
    });
  });

  describe('patchAll', () => {
    const filter = { status: IngredientStatus.PROCESSING };
    const update = { status: IngredientStatus.GENERATED };

    it('should update multiple videos successfully', async () => {
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

  describe('Video-specific Operations', () => {
    it('should handle video processing status updates', async () => {
      const id = new Types.ObjectId().toString();
      const statusUpdate = { status: IngredientStatus.PROCESSING };

      const result = await service.patch(id, statusUpdate);

      expect(result).toEqual(mockVideoDocument);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: statusUpdate },
        { returnDocument: 'after' },
      );
    });

    it('should handle video metadata updates', async () => {
      const id = new Types.ObjectId().toString();
      const metadataUpdate = {
        status: IngredientStatus.PROCESSING,
        url: 'https://example.com/processed-video.mp4',
      };

      const result = await service.patch(id, metadataUpdate);

      expect(result).toEqual(mockVideoDocument);
    });

    it('should handle video transcoding updates', async () => {
      const filter = { status: IngredientStatus.PROCESSING };
      const update = { status: IngredientStatus.GENERATED };

      const result = await service.patchAll(filter, update);

      expect(result).toEqual({ modifiedCount: 1 });
    });
  });

  describe('Error Handling', () => {
    it('should log and rethrow database connection errors', async () => {
      const dbError = new Error('Connection refused');
      mockModel.aggregate.mockReturnValue({
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
      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockRejectedValue(timeoutError),
      });

      await expect(service.findOne({})).rejects.toThrow(timeoutError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty update object in patch', async () => {
      const id = new Types.ObjectId().toString();
      const emptyUpdate = {};

      const result = await service.patch(id, emptyUpdate);

      expect(result).toEqual(mockVideoDocument);
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
      const id = new Types.ObjectId().toString();
      const updates = [
        { status: IngredientStatus.PROCESSING },
        { status: IngredientStatus.GENERATED },
      ];

      const promises = updates.map((update) => service.patch(id, update));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('should handle very long video durations', async () => {
      const createDto = {
        brand: new Types.ObjectId().toString(),
        category: IngredientCategory.VIDEO,
        duration: 36000, // 10 hours
        url: 'https://example.com/long-video.mp4',
        user: new Types.ObjectId().toString(),
      };

      const longVideo = { ...mockVideoDocument, duration: 36000 };
      mockModel.mockImplementationOnce(function () {
        return { save: vi.fn().mockResolvedValue(longVideo) };
      });
      mockModel.findById.mockReturnValue({
        exec: vi.fn().mockResolvedValue(longVideo),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.create(createDto);

      expect(result.duration).toBe(36000);
    });
  });
});
