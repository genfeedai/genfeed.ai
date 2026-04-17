import { InsightsService } from '@api/collections/insights/services/insights.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Forecast, type Insight } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('InsightsService', () => {
  let service: InsightsService;
  let insightModel: ReturnType<typeof createMockModel>;
  let forecastModel: ReturnType<typeof createMockModel>;
  let replicateService: {
    generateTextCompletionSync: ReturnType<typeof vi.fn>;
  };

  const mockInsightId = '507f1f77bcf86cd799439011';
  const mockOrganizationId = '507f1f77bcf86cd799439013';

  const mockInsight = {
    _id: mockInsightId,
    category: 'trend',
    description: 'Videos with humor perform 50% better',
    isDeleted: false,
    isDismissed: false,
    isRead: false,
    organization: mockOrganizationId,
    title: 'High Engagement Content',
  };

  beforeEach(async () => {
    const mockInsightModelFn: any = vi.fn().mockImplementation(function (
      this: unknown,
      data: Record<string, unknown>,
    ) {
      return {
        ...data,
        save: vi.fn().mockResolvedValue({ ...data }),
        toObject: vi.fn().mockReturnValue({ ...data }),
      };
    });
    mockInsightModelFn.collection = { name: 'insights' };
    mockInsightModelFn.modelName = 'Insight';
    mockInsightModelFn.find = vi.fn();
    mockInsightModelFn.findOne = vi.fn();
    mockInsightModelFn.findOneAndUpdate = vi.fn();

    const mockForecastModel = {
      collection: { name: 'forecasts' },
      findOne: vi
        .fn()
        .mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
      modelName: 'Forecast',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: PrismaService, useValue: mockForecastModel },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ReplicateService,
          useValue: {
            generateTextCompletionSync: vi.fn(),
            runModel: vi.fn(),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            getModelConfig: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);
    insightModel = module.get(PrismaService);
    forecastModel = module.get(PrismaService);
    replicateService = module.get(ReplicateService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getInsights', () => {
    it('should return existing insights when enough exist', async () => {
      const mockInsights = [
        mockInsight,
        { ...mockInsight, _id: 'test-object-id' },
      ];

      insightModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(mockInsights),
          }),
        }),
      });

      const result = await service.getInsights(
        mockOrganizationId.toString(),
        2,
      );

      expect(result).toHaveLength(2);
      expect(insightModel.find).toHaveBeenCalled();
    });

    it('should generate new insights when fewer than limit exist', async () => {
      insightModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockAIResponse = JSON.stringify({
        insights: [
          {
            actionableSteps: ['Step 1'],
            confidence: 85,
            description: 'Test description',
            impact: 'high',
            relatedMetrics: ['engagement'],
            title: 'Test Insight',
            type: 'opportunity',
          },
        ],
      });

      replicateService.generateTextCompletionSync.mockResolvedValue(
        mockAIResponse,
      );

      const result = await service.getInsights(
        mockOrganizationId.toString(),
        1,
      );

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if underlying query fails', async () => {
      const error = new Error('Database error');

      insightModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockRejectedValue(error),
          }),
        }),
      });

      await expect(
        service.getInsights(mockOrganizationId.toString()),
      ).rejects.toThrow('Database error');
    });
  });

  describe('markAsRead', () => {
    it('should mark an insight as read', async () => {
      const updatedInsight = { ...mockInsight, isRead: true };

      insightModel.findOneAndUpdate = vi.fn().mockReturnValue({
        toObject: vi.fn().mockReturnValue(updatedInsight),
      });

      // Simulate successful findOneAndUpdate returning a document with toObject
      insightModel.findOneAndUpdate.mockResolvedValue({
        toObject: vi.fn().mockReturnValue(updatedInsight),
      });

      const result = await service.markAsRead(
        mockInsightId.toString(),
        mockOrganizationId.toString(),
      );

      expect(result).toBeDefined();
      expect(insightModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: mockInsightId.toString(),
          isDeleted: false,
          organization: mockOrganizationId.toString(),
        },
        { isRead: true },
        { returnDocument: 'after' },
      );
    });

    it('should throw error when insight not found', async () => {
      insightModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.markAsRead(
          mockInsightId.toString(),
          mockOrganizationId.toString(),
        ),
      ).rejects.toThrow('Insight not found');
    });
  });

  describe('markAsDismissed', () => {
    it('should mark an insight as dismissed', async () => {
      const updatedInsight = { ...mockInsight, isDismissed: true };

      insightModel.findOneAndUpdate.mockResolvedValue({
        toObject: vi.fn().mockReturnValue(updatedInsight),
      });

      const result = await service.markAsDismissed(
        mockInsightId.toString(),
        mockOrganizationId.toString(),
      );

      expect(result).toBeDefined();
      expect(insightModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: mockInsightId.toString(),
          isDeleted: false,
          organization: mockOrganizationId.toString(),
        },
        { isDismissed: true },
        { returnDocument: 'after' },
      );
    });

    it('should throw error when insight not found', async () => {
      insightModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.markAsDismissed(
          mockInsightId.toString(),
          mockOrganizationId.toString(),
        ),
      ).rejects.toThrow('Insight not found');
    });
  });

  describe('getGrowthPrediction', () => {
    it('should throw error because real follower count is unavailable', async () => {
      await expect(
        service.getGrowthPrediction('instagram', mockOrganizationId.toString()),
      ).rejects.toThrow('Insufficient data');
    });
  });
});
