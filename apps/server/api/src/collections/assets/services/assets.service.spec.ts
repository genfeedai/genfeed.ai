import { Asset } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AssetsService', () => {
  let service: AssetsService;
  let mockModelProvider: Record<string, unknown>;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const createTestingModule = async (model: unknown) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: getModelToken(Asset.name, DB_CONNECTIONS.CLOUD),
          useValue: model,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    return module;
  };

  beforeEach(async () => {
    mockModelProvider = {
      collection: { name: 'assets' },
      find: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      }),
      findById: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      }),
      findByIdAndUpdate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      }),
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      }),
      modelName: 'Asset',
      updateMany: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
      }),
    };

    const module = await createTestingModule(mockModelProvider);
    service = module.get<AssetsService>(AssetsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('saves and returns the created asset', async () => {
      const dto = { category: 'asset' };
      const saved = { _id: 'a1', ...dto };
      const returned = { ...saved, populated: true };

      const saveMock = vi.fn().mockResolvedValue(saved);
      const execMock = vi.fn().mockResolvedValue(returned);
      const populateMock = vi.fn().mockReturnThis();
      const findByIdMock = vi
        .fn()
        .mockReturnValue({ exec: execMock, populate: populateMock });

      const constructorModel = vi.fn().mockImplementation(function () {
        return { save: saveMock };
      });
      constructorModel.findById = findByIdMock;
      constructorModel.collection = { name: 'assets' };
      constructorModel.modelName = 'Asset';

      const module = await createTestingModule(constructorModel);
      service = module.get<AssetsService>(AssetsService);

      const result = await service.create(dto);

      expect(saveMock).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('constructorName', () => {
    it('should have constructorName set to AssetsService', () => {
      expect(service.constructorName).toBe('AssetsService');
    });
  });

  describe('findOne', () => {
    it('should call model.findOne with params and return doc', async () => {
      const execMock = vi.fn().mockResolvedValue({ _id: 'a1' });
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      const findOneMock = vi.fn().mockReturnValue({
        exec: execMock,
        populate: populateMock,
      });

      const constructorModel = vi.fn();
      constructorModel.findOne = findOneMock;
      constructorModel.findById = vi.fn();
      constructorModel.collection = { name: 'assets' };
      constructorModel.modelName = 'Asset';

      const module = await createTestingModule(constructorModel);
      const svc = module.get<AssetsService>(AssetsService);

      const result = await svc.findOne({ _id: 'a1' });
      expect(result).toEqual({ _id: 'a1' });
    });

    it('should return null when not found', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const findOneMock = vi.fn().mockReturnValue({
        exec: execMock,
        populate: vi.fn().mockReturnValue({ exec: execMock }),
      });

      const constructorModel = vi.fn();
      constructorModel.findOne = findOneMock;
      constructorModel.findById = vi.fn();
      constructorModel.collection = { name: 'assets' };
      constructorModel.modelName = 'Asset';

      const module = await createTestingModule(constructorModel);
      const svc = module.get<AssetsService>(AssetsService);

      const result = await svc.findOne({ _id: 'nonexistent' });
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should call aggregate and aggregatePaginate', async () => {
      const aggregateMock = vi.fn().mockReturnValue('agg');
      const paginateMock = vi.fn().mockResolvedValue({ docs: [], total: 0 });
      const constructorModel = vi.fn();
      constructorModel.aggregate = aggregateMock;
      constructorModel.aggregatePaginate = paginateMock;
      constructorModel.collection = { name: 'assets' };
      constructorModel.modelName = 'Asset';

      const module = await createTestingModule(constructorModel);
      const svc = module.get<AssetsService>(AssetsService);

      const result = await svc.findAll([], {});
      expect(aggregateMock).toHaveBeenCalledWith([]);
      expect(paginateMock).toHaveBeenCalledWith('agg', {});
      expect(result).toEqual({ docs: [], total: 0 });
    });
  });
});
