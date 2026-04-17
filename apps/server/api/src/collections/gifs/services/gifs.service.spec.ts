import { GifsService } from '@api/collections/gifs/services/gifs.service';
import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('GifsService', () => {
  let service: GifsService;

  interface MockModelType {
    aggregate: ReturnType<typeof vi.fn>;
    aggregatePaginate: ReturnType<typeof vi.fn>;
    collection: { name: string };
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByIdAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    modelName: string;
    updateMany: ReturnType<typeof vi.fn>;
  }

  let mockModel: MockModelType;

  const gifId = 'test-object-id';
  const mockGif = {
    _id: gifId,
    category: 'gif',
    isDeleted: false,
    scope: 'private',
  };

  beforeEach(async () => {
    const modelConstructor = vi.fn().mockImplementation(() => ({
      save: vi.fn().mockResolvedValue(mockGif),
    }));

    mockModel = Object.assign(modelConstructor, {
      aggregate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockGif]),
      }),
      aggregatePaginate: vi.fn().mockResolvedValue({
        docs: [mockGif],
        totalDocs: 1,
      }),
      collection: { name: 'ingredients' },
      find: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockGif]),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      }),
      findById: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockGif),
        populate: vi.fn().mockReturnThis(),
      }),
      findByIdAndUpdate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockGif),
        populate: vi.fn().mockReturnThis(),
      }),
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockGif),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      }),
      modelName: 'Ingredient',
      updateMany: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      }),
    }) as unknown as MockModelType;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GifsService,
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

    service = module.get<GifsService>(GifsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be an instance of GifsService', () => {
    expect(service).toBeInstanceOf(GifsService);
  });

  it('should have logger available', () => {
    expect(service.logger).toBeDefined();
  });

  describe('findAll (inherited)', () => {
    it('should call aggregatePaginate with pipeline and options', async () => {
      const pipeline = [{ $match: { category: 'gif' } }];
      const options = { limit: 10, page: 1 };
      await service.findAll(pipeline, options);
      expect(mockModel.aggregate).toHaveBeenCalled();
      expect(mockModel.aggregatePaginate).toHaveBeenCalled();
    });

    it('should return paginated results', async () => {
      const result = await service.findAll([], { limit: 10, page: 1 });
      expect(result).toEqual(
        expect.objectContaining({ docs: expect.any(Array), totalDocs: 1 }),
      );
    });
  });

  describe('findOne (inherited)', () => {
    it('should use aggregate pipeline for findOne', async () => {
      await service.findOne({ _id: gifId.toString() });
      expect(mockModel.aggregate).toHaveBeenCalled();
    });

    it('should return null when no results found', async () => {
      mockModel.aggregate.mockReturnValueOnce({
        exec: vi.fn().mockResolvedValue([]),
      });
      const result = await service.findOne({ _id: gifId.toString() });
      expect(result).toBeNull();
    });
  });

  describe('remove (inherited)', () => {
    it('should soft-delete by updating isDeleted', async () => {
      await service.remove(gifId.toString());
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        gifId.toString(),
        expect.objectContaining({ isDeleted: true }),
        expect.any(Object),
      );
    });

    it('should return the updated document', async () => {
      const result = await service.remove(gifId.toString());
      expect(result).toBeDefined();
    });
  });

  describe('model operations', () => {
    it('should use the Ingredient model for the ingredients collection', () => {
      expect(mockModel.collection.name).toBe('ingredients');
      expect(mockModel.modelName).toBe('Ingredient');
    });
  });
});
