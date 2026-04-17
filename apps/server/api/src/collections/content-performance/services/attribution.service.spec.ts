import { ContentPerformance } from '@api/collections/content-performance/schemas/content-performance.schema';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('AttributionService', () => {
  let service: AttributionService;

  const mockModel = {
    aggregate: vi.fn().mockReturnThis(),
    exec: vi.fn(),
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
        AttributionService,
        { provide: PrismaService, useValue: mockModel },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AttributionService>(AttributionService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAttributionByGenerationId', () => {
    it('should return attribution data', async () => {
      mockModel.exec.mockResolvedValue([
        {
          _id: 'gen-123',
          avgEngagementRate: 5.5,
          avgPerformanceScore: 72,
          hookUsed: 'curiosity-gap',
          promptUsed: 'Write a viral tweet about...',
          totalEngagements: 500,
          totalRecords: 10,
          totalViews: 10000,
          workflowExecutionId: null,
        },
      ]);

      const result = await service.getAttributionByGenerationId(
        '507f1f77bcf86cd799439012',
        'gen-123',
      );

      expect(result).not.toBeNull();
      expect(result?.generationId).toBe('gen-123');
      expect(result?.avgPerformanceScore).toBe(72);
      expect(result?.promptUsed).toBe('Write a viral tweet about...');
    });

    it('should return null when no data found', async () => {
      mockModel.exec.mockResolvedValue([]);

      const result = await service.getAttributionByGenerationId(
        '507f1f77bcf86cd799439012',
        'gen-nonexistent',
      );

      expect(result).toBeNull();
    });
  });

  describe('rankGenerationStrategies', () => {
    it('should return ranked strategies', async () => {
      mockModel.exec.mockResolvedValue([
        { _id: 'gen-1', avgPerformanceScore: 90, totalRecords: 5 },
        { _id: 'gen-2', avgPerformanceScore: 75, totalRecords: 8 },
      ]);

      const results = await service.rankGenerationStrategies(
        '507f1f77bcf86cd799439012',
      );

      expect(results).toHaveLength(2);
      expect(results[0].generationId).toBe('gen-1');
    });

    it('should filter by brand when provided', async () => {
      mockModel.exec.mockResolvedValue([]);

      await service.rankGenerationStrategies(
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013',
        10,
      );

      expect(mockModel.aggregate).toHaveBeenCalled();
    });
  });
});
