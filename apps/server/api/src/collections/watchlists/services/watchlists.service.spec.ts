import { CreateWatchlistDto } from '@api/collections/watchlists/dto/create-watchlist.dto';
import { Watchlist } from '@api/collections/watchlists/schemas/watchlist.schema';
import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WatchlistPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('WatchlistsService', () => {
  let service: WatchlistsService;
  let model: ReturnType<typeof createMockModel>;
  let logger: LoggerService;

  const mockWatchlist = {
    _id: '507f1f77bcf86cd799439011',
    brand: 'test-object-id',
    createdAt: new Date(),
    handle: 'testuser',
    isDeleted: false,
    metrics: {
      avgViews: 5000,
      engagementRate: 3.5,
      followers: 10000,
    },
    platform: WatchlistPlatform.INSTAGRAM,
    updatedAt: new Date(),
  };

  let mockModelFn: ReturnType<typeof createMockModel>;
  let mockModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    mockModelFn = vi.fn().mockImplementation(function () {
      return {
        save: vi.fn().mockResolvedValue(mockWatchlist),
      };
    });
    mockModelFn.collection = { name: 'watchlists' };
    mockModelFn.modelName = 'Watchlist';
    mockModelFn.aggregate = vi.fn();
    mockModelFn.aggregatePaginate = vi.fn();
    mockModelFn.create = vi.fn();
    mockModelFn.deleteMany = vi.fn();
    mockModelFn.exec = vi.fn();
    mockModelFn.find = vi.fn();
    mockModelFn.findById = vi
      .fn()
      .mockReturnValue({ exec: vi.fn(), populate: vi.fn().mockReturnThis() });
    mockModelFn.findByIdAndDelete = vi.fn();
    mockModelFn.findByIdAndUpdate = vi.fn();
    mockModelFn.findOne = vi.fn();
    mockModelFn.populate = vi.fn();
    mockModelFn.save = vi.fn();
    mockModelFn.sort = vi.fn();
    mockModelFn.updateMany = vi.fn().mockReturnValue({ exec: vi.fn() });
    mockModel = mockModelFn;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchlistsService,
        { provide: PrismaService, useValue: mockModelFn },
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

    service = module.get<WatchlistsService>(WatchlistsService);
    model = module.get(PrismaService);
    logger = module.get<LoggerService>(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByHandle', () => {
    it('should find watchlist by brand, platform and handle', async () => {
      const brandId = 'test-object-id'.toString();
      const platform = WatchlistPlatform.INSTAGRAM;
      const handle = 'testuser';

      mockModel.findOne = vi.fn().mockResolvedValue(mockWatchlist);
      model.findOne = mockModel.findOne;

      const result = await service.findByHandle(brandId, platform, handle);

      expect(model.findOne).toHaveBeenCalledWith({
        brand: brandId,
        handle: 'testuser',
        isDeleted: false,
        platform,
      });
      expect(result).toEqual(mockWatchlist);
    });

    it('should remove @ symbol from handle', async () => {
      const brandId = 'test-object-id'.toString();
      const platform = WatchlistPlatform.TWITTER;
      const handle = '@testuser';

      mockModel.findOne = vi.fn().mockResolvedValue(mockWatchlist);
      model.findOne = mockModel.findOne;

      await service.findByHandle(brandId, platform, handle);

      expect(model.findOne).toHaveBeenCalledWith({
        brand: brandId,
        handle: 'testuser',
        isDeleted: false,
        platform,
      });
    });

    it('should return null when not found', async () => {
      const brandId = 'test-object-id'.toString();
      const platform = WatchlistPlatform.YOUTUBE;
      const handle = 'nonexistent';

      mockModel.findOne = vi.fn().mockResolvedValue(null);
      model.findOne = mockModel.findOne;

      const result = await service.findByHandle(brandId, platform, handle);

      expect(result).toBeNull();
    });

    it('should handle ObjectId as brandId', async () => {
      const brandId = 'test-object-id';
      const platform = WatchlistPlatform.TIKTOK;
      const handle = 'testuser';

      mockModel.findOne = vi.fn().mockResolvedValue(mockWatchlist);
      model.findOne = mockModel.findOne;

      const result = await service.findByHandle(brandId, platform, handle);

      expect(model.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockWatchlist);
    });
  });

  describe('updateMetrics', () => {
    it('should update watchlist metrics', async () => {
      const id = 'test-object-id'.toString();
      const metrics = {
        avgViews: 7000,
        engagementRate: 4.2,
        followers: 15000,
      };

      mockModel.findByIdAndUpdate = vi
        .fn()
        .mockResolvedValue({ ...mockWatchlist, metrics });
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      const result = await service.updateMetrics(id, metrics);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { metrics } },
        { returnDocument: 'after' },
      );
      expect(result.metrics).toEqual(metrics);
    });

    it('should update partial metrics', async () => {
      const id = 'test-object-id'.toString();
      const metrics = {
        followers: 20000,
      };

      mockModel.findByIdAndUpdate = vi.fn().mockResolvedValue(mockWatchlist);
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      await service.updateMetrics(id, metrics);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { $set: { metrics } },
        { returnDocument: 'after' },
      );
    });

    it('should return null when watchlist not found', async () => {
      const id = 'test-object-id'.toString();
      const metrics = { followers: 15000 };

      mockModel.findByIdAndUpdate = vi.fn().mockResolvedValue(null);
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      const result = await service.updateMetrics(id, metrics);

      expect(result).toBeNull();
    });

    it('should handle ObjectId as id', async () => {
      const id = 'test-object-id';
      const metrics = { avgViews: 8000 };

      mockModel.findByIdAndUpdate = vi.fn().mockResolvedValue(mockWatchlist);
      model.findByIdAndUpdate = mockModel.findByIdAndUpdate;

      const result = await service.updateMetrics(id, metrics);

      expect(model.findByIdAndUpdate).toHaveBeenCalled();
      expect(result).toEqual(mockWatchlist);
    });
  });

  describe('findAllByAccount', () => {
    it('should find all watchlists for a brand', async () => {
      const brandId = 'test-object-id'.toString();
      const mockWatchlists = [mockWatchlist, { ...mockWatchlist, _id: '2' }];

      mockModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockWatchlists),
        }),
      });
      model.find = mockModel.find;

      const result = await service.findAllByAccount(brandId);

      expect(model.find).toHaveBeenCalledWith({
        brand: brandId,
        isDeleted: false,
      });
      expect(result).toEqual(mockWatchlists);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no watchlists found', async () => {
      const brandId = 'test-object-id'.toString();

      mockModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      });
      model.find = mockModel.find;

      const result = await service.findAllByAccount(brandId);

      expect(result).toEqual([]);
    });

    it('should sort results by createdAt descending', async () => {
      const brandId = 'test-object-id'.toString();

      const sortMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockWatchlist]),
      });

      mockModel.find = vi.fn().mockReturnValue({
        sort: sortMock,
      });
      model.find = mockModel.find;

      await service.findAllByAccount(brandId);

      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should handle ObjectId as brandId', async () => {
      const brandId = 'test-object-id';

      mockModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([mockWatchlist]),
        }),
      });
      model.find = mockModel.find;

      const result = await service.findAllByAccount(brandId);

      expect(model.find).toHaveBeenCalled();
      expect(result).toEqual([mockWatchlist]);
    });
  });

  describe('create', () => {
    it('should create a watchlist', async () => {
      const createDto: CreateWatchlistDto = {
        brand: 'test-object-id'.toString(),
        handle: 'newuser',
        platform: WatchlistPlatform.INSTAGRAM,
      } as CreateWatchlistDto;

      const savedDoc = {
        ...mockWatchlist,
        save: vi.fn().mockResolvedValue(mockWatchlist),
      };

      (model as any).mockImplementationOnce(function () {
        return savedDoc;
      });

      const result = await service.create(createDto);

      expect(logger.debug).toHaveBeenCalled();
      expect(result).toEqual(mockWatchlist);
    });
  });
});
