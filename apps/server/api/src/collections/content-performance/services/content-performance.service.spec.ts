import { ContentPerformance } from '@api/collections/content-performance/schemas/content-performance.schema';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { Post } from '@api/collections/posts/schemas/post.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentPerformanceService', () => {
  let service: ContentPerformanceService;

  const mockModel = {
    aggregate: vi.fn().mockReturnThis(),
    aggregatePaginate: vi.fn(),
    create: vi.fn(),
    exec: vi.fn(),
    find: vi.fn().mockReturnThis(),
    findOne: vi.fn().mockReturnThis(),
    insertMany: vi.fn(),
    limit: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  };

  const mockPostModel = {
    db: {
      collection: vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(null),
      }),
    },
    find: vi.fn().mockReturnThis(),
    findOne: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    setContext: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentPerformanceService,
        {
          provide: getModelToken(ContentPerformance.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: getModelToken(Post.name, DB_CONNECTIONS.CLOUD),
          useValue: mockPostModel,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ContentPerformanceService>(ContentPerformanceService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queryPerformance', () => {
    it('should build query with filters', async () => {
      mockModel.exec.mockResolvedValue([]);

      await service.queryPerformance(
        { brand: '507f1f77bcf86cd799439011', platform: 'instagram' as any },
        '507f1f77bcf86cd799439012',
      );

      expect(mockModel.find).toHaveBeenCalled();
      expect(mockModel.sort).toHaveBeenCalledWith({ measuredAt: -1 });
    });

    it('should handle date range filters', async () => {
      mockModel.exec.mockResolvedValue([]);

      await service.queryPerformance(
        { endDate: '2026-02-01', startDate: '2026-01-01' },
        '507f1f77bcf86cd799439012',
      );

      expect(mockModel.find).toHaveBeenCalled();
    });
  });

  describe('getTopPerformers', () => {
    it('should return sorted results', async () => {
      mockModel.exec.mockResolvedValue([]);

      await service.getTopPerformers('507f1f77bcf86cd799439012', undefined, 5);

      expect(mockModel.find).toHaveBeenCalled();
      expect(mockModel.sort).toHaveBeenCalledWith({ performanceScore: -1 });
      expect(mockModel.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('aggregateByGenerationId', () => {
    it('should aggregate metrics', async () => {
      mockModel.exec.mockResolvedValue([
        {
          _id: 'gen-123',
          avgPerformanceScore: 75,
          totalLikes: 50,
          totalViews: 1000,
        },
      ]);

      const result = await service.aggregateByGenerationId(
        '507f1f77bcf86cd799439012',
        'gen-123',
      );

      expect(mockModel.aggregate).toHaveBeenCalled();
      expect(result).toHaveProperty('_id', 'gen-123');
    });

    it('should return empty object when no data', async () => {
      mockModel.exec.mockResolvedValue([]);

      const result = await service.aggregateByGenerationId(
        '507f1f77bcf86cd799439012',
        'gen-nonexistent',
      );

      expect(result).toEqual({});
    });
  });
});
