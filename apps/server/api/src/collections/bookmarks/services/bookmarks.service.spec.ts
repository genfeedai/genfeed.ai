import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';
import { Bookmark } from '@api/collections/bookmarks/schemas/bookmark.schema';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('BookmarksService', () => {
  let service: BookmarksService;
  let model: Record<string, unknown>;
  let _logger: LoggerService;

  const mockBookmark = {
    _id: '507f1f77bcf86cd799439011',
    createdAt: new Date(),
    description: 'A test article',
    generatedIngredients: [],
    isDeleted: false,
    platform: 'web',
    title: 'Test Article',
    updatedAt: new Date(),
    url: 'https://example.com/article',
  };

  const buildMockModel = (overrides: Record<string, unknown> = {}) => ({
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    collection: { name: 'bookmarks' },
    deleteMany: vi.fn(),
    exec: vi.fn(),
    find: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
      lean: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
    }),
    findById: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      populate: vi.fn().mockReturnThis(),
    }),
    findByIdAndDelete: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    }),
    findByIdAndUpdate: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      populate: vi.fn().mockReturnThis(),
    }),
    findOne: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      populate: vi.fn().mockReturnThis(),
    }),
    modelName: 'Bookmark',
    populate: vi.fn(),
    save: vi.fn(),
    updateMany: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    }),
    ...overrides,
  });

  const createTestingModule = async (mockModel: unknown) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookmarksService,
        { provide: PrismaService, useValue: mockModel },
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

    return module;
  };

  beforeEach(async () => {
    const mockModelInstance = buildMockModel();
    const module = await createTestingModule(mockModelInstance);

    service = module.get<BookmarksService>(BookmarksService);
    model = module.get(PrismaService);
    _logger = module.get<LoggerService>(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a bookmark successfully', async () => {
      const createDto: CreateBookmarkDto = {
        platform: 'web',
        title: 'Test Article',
        url: 'https://example.com/article',
      } as CreateBookmarkDto;

      const savedDoc = { ...mockBookmark };
      const saveMock = vi.fn().mockResolvedValue(savedDoc);

      const constructorModel = vi.fn().mockImplementation(function () {
        return { save: saveMock };
      });
      constructorModel.collection = { name: 'bookmarks' };
      constructorModel.modelName = 'Bookmark';

      const module = await createTestingModule(constructorModel);
      service = module.get<BookmarksService>(BookmarksService);
      _logger = module.get<LoggerService>(LoggerService);

      const result = await service.create(createDto);

      expect(saveMock).toHaveBeenCalled();
      expect(result).toEqual(savedDoc);
    });
  });

  describe('addGeneratedIngredient', () => {
    it('should add a generated ingredient to bookmark', async () => {
      const bookmarkId = 'test-object-id'.toString();
      const ingredientId = 'test-object-id'.toString();

      const findByIdAndUpdateMock = vi.fn().mockResolvedValue(mockBookmark);
      (model as Record<string, unknown>).findByIdAndUpdate =
        findByIdAndUpdateMock;

      const result = await service.addGeneratedIngredient(
        bookmarkId,
        ingredientId,
      );

      expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
        bookmarkId,
        {
          $addToSet: { generatedIngredients: ingredientId },
          $set: { processedAt: expect.any(Date) },
        },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(mockBookmark);
    });

    it('should handle adding ingredient with ObjectId types', async () => {
      const bookmarkId = 'test-object-id';
      const ingredientId = 'test-object-id';

      const findByIdAndUpdateMock = vi.fn().mockResolvedValue(mockBookmark);
      (model as Record<string, unknown>).findByIdAndUpdate =
        findByIdAndUpdateMock;

      const result = await service.addGeneratedIngredient(
        bookmarkId,
        ingredientId,
      );

      expect(findByIdAndUpdateMock).toHaveBeenCalled();
      expect(result).toEqual(mockBookmark);
    });

    it('should return null when bookmark not found', async () => {
      const bookmarkId = 'test-object-id'.toString();
      const ingredientId = 'test-object-id'.toString();

      const findByIdAndUpdateMock = vi.fn().mockResolvedValue(null);
      (model as Record<string, unknown>).findByIdAndUpdate =
        findByIdAndUpdateMock;

      const result = await service.addGeneratedIngredient(
        bookmarkId,
        ingredientId,
      );

      expect(result).toBeNull();
    });
  });

  describe('extractMetadata', () => {
    it('should return empty object (not yet implemented)', () => {
      const url = 'https://example.com/article';

      const result = service.extractMetadata(url);

      expect(result).toEqual({});
    });

    it('should handle different URL formats', () => {
      const urls = [
        'https://twitter.com/user/status/123',
        'https://youtube.com/watch?v=abc',
        'https://medium.com/@author/article',
      ];

      for (const url of urls) {
        const result = service.extractMetadata(url);
        expect(result).toEqual({});
      }
    });
  });

  describe('findOne', () => {
    it('should find one bookmark', async () => {
      const params = { _id: mockBookmark._id };

      const findOneMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockBookmark),
        populate: vi.fn().mockReturnThis(),
      });
      (model as Record<string, unknown>).findOne = findOneMock;

      const result = await service.findOne(params);

      expect(findOneMock).toHaveBeenCalled();
      expect(result).toEqual(mockBookmark);
    });
  });

  describe('patch', () => {
    it('should update a bookmark', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto: UpdateBookmarkDto = {
        title: 'Updated Bookmark',
      };

      const findByIdAndUpdateMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockBookmark),
        populate: vi.fn().mockReturnThis(),
      });
      (model as Record<string, unknown>).findByIdAndUpdate =
        findByIdAndUpdateMock;

      const result = await service.patch(id, updateDto);

      expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
        id,
        { $set: updateDto },
        { returnDocument: 'after' },
      );
      expect(result).toEqual(mockBookmark);
    });
  });

  describe('remove', () => {
    it('should soft delete a bookmark', async () => {
      const id = '507f1f77bcf86cd799439011';

      const findByIdAndUpdateMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ ...mockBookmark, isDeleted: true }),
        populate: vi.fn().mockReturnThis(),
      });
      (model as Record<string, unknown>).findByIdAndUpdate =
        findByIdAndUpdateMock;

      const result = await service.remove(id);

      expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
        id,
        { isDeleted: true },
        { returnDocument: 'after' },
      );
      expect(result).toEqual({ ...mockBookmark, isDeleted: true });
    });
  });
});
