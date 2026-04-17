import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { EvaluationType, IngredientCategory, Status } from '@genfeedai/enums';
import { type Evaluation } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('EvaluationsService', () => {
  let service: EvaluationsService;
  let _loggerService: LoggerService;
  let model: {
    find: vi.Mock;
    aggregate: vi.Mock;
    findById: vi.Mock;
  };

  const mockServices = {
    loggerService: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
  };

  beforeEach(async () => {
    model = {
      aggregate: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluationsService,
        { provide: PrismaService, useValue: model },
        { provide: LoggerService, useValue: mockServices.loggerService },
        {
          provide: EvaluationsOperationsService,
          useValue: {
            evaluateArticle: vi.fn(),
            evaluateImage: vi.fn(),
            evaluatePost: vi.fn(),
            evaluateVideo: vi.fn(),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(false),
            deductCreditsFromOrganization: vi.fn(),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
            refundOrganizationCredits: vi.fn(),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: {
            emit: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EvaluationsService>(EvaluationsService);
    _loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateContent', () => {
    it('should throw when insufficient credits', async () => {
      // checkOrganizationCreditsAvailable returns false in mock
      await expect(
        service.evaluateContent(
          IngredientCategory.VIDEO,
          '507f1f77bcf86cd799439014',
          EvaluationType.PRE_PUBLICATION,
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439013',
        ),
      ).rejects.toThrow();
    });

    it('should log evaluation request', async () => {
      try {
        await service.evaluateContent(
          IngredientCategory.VIDEO,
          '507f1f77bcf86cd799439014',
          EvaluationType.PRE_PUBLICATION,
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439013',
        );
      } catch (_error) {
        // Expected to throw
      }

      expect(mockServices.loggerService.log).toHaveBeenCalled();
    });
  });

  describe('evaluateVideo', () => {
    it('should throw error when videos service not available', async () => {
      await expect(
        service.evaluateVideo(
          '507f1f77bcf86cd799439014',
          EvaluationType.PRE_PUBLICATION,
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439013',
        ),
      ).rejects.toThrow('VideosService not available');
    });
  });

  describe('evaluateImage', () => {
    it('should throw error when images service not available', async () => {
      await expect(
        service.evaluateImage(
          '507f1f77bcf86cd799439014',
          EvaluationType.PRE_PUBLICATION,
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439013',
        ),
      ).rejects.toThrow('ImagesService not available');
    });
  });

  describe('evaluateArticle', () => {
    it('should throw error when articles service not available', async () => {
      await expect(
        service.evaluateArticle(
          '507f1f77bcf86cd799439014',
          EvaluationType.PRE_PUBLICATION,
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439013',
        ),
      ).rejects.toThrow('ArticlesService not available');
    });
  });

  describe('evaluateExternalUrl', () => {
    it('should throw HttpException for unimplemented external evaluation', () => {
      expect(() =>
        service.evaluateExternalUrl(
          { url: 'https://example.com/video' },
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439013',
        ),
      ).toThrow(HttpException);
    });
  });

  describe('getContentEvaluations', () => {
    it('should return evaluations for content', async () => {
      const contentId = '507f1f77bcf86cd799439015';
      const organizationId = '507f1f77bcf86cd799439012';
      const mockEvaluations = [{ _id: 'test-object-id', score: 90 }];
      model.find.mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockEvaluations),
      });

      const result = await service.getContentEvaluations(
        IngredientCategory.VIDEO,
        contentId,
        organizationId,
      );

      expect(model.find).toHaveBeenCalledTimes(1);
      const filter = model.find.mock.calls[0][0];
      expect(filter.contentType).toBe(IngredientCategory.VIDEO);
      expect(filter.content.toHexString()).toBe(contentId);
      expect(filter.organization.toHexString()).toBe(organizationId);
      expect(filter.isDeleted).toBe(false);
      expect(result).toEqual(mockEvaluations);
    });
  });

  describe('getEvaluationTrends', () => {
    it('should return evaluation trends', async () => {
      const organizationId = '507f1f77bcf86cd799439012';
      const mockTrends = [
        { _id: '2024-01-01', avgBrandScore: 90, avgScore: 85, count: 4 },
      ];

      model.aggregate.mockResolvedValue(mockTrends);

      const result = await service.getEvaluationTrends(organizationId, {
        contentType: IngredientCategory.VIDEO,
        endDate: '2024-03-01',
        evaluationType: EvaluationType.PRE_PUBLICATION,
        maxScore: '95',
        minScore: '70',
        startDate: '2024-01-01',
      });

      expect(model.aggregate).toHaveBeenCalledTimes(1);
      const pipeline = model.aggregate.mock.calls[0][0];
      expect(pipeline).toHaveLength(3);
      expect(pipeline[0].$match.organization.toHexString()).toBe(
        organizationId,
      );
      expect(pipeline[0].$match.evaluationType).toBe(
        EvaluationType.PRE_PUBLICATION,
      );
      expect(pipeline[0].$match.overallScore).toEqual({
        $gte: 70,
        $lte: 95,
      });
      expect(result).toEqual(mockTrends);
    });
  });

  describe('syncPostPublicationPerformance', () => {
    it('updates evaluation with actual performance data', async () => {
      const evaluationId = '507f1f77bcf86cd799439014';
      const evaluationDoc = {
        actualPerformance: undefined,
        save: vi.fn().mockImplementation(function save() {
          return Promise.resolve(this);
        }),
        scores: { engagement: { overall: 80 } },
        status: Status.COMPLETED,
      };

      model.findById.mockResolvedValue(evaluationDoc);

      const result = await service.syncPostPublicationPerformance(
        evaluationId,
        {
          engagement: 70,
          engagementRate: 5.4,
          views: 1200,
        },
      );

      expect(model.findById).toHaveBeenCalledWith(evaluationId);
      expect(evaluationDoc.save).toHaveBeenCalled();
      expect(result.actualPerformance).toMatchObject({
        accuracyScore: 90,
        engagement: 70,
        engagementRate: 5.4,
        views: 1200,
      });
      expect(result.actualPerformance.syncedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when evaluation is missing', async () => {
      model.findById.mockResolvedValue(null);

      await expect(
        service.syncPostPublicationPerformance('missing', {
          engagement: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when evaluation status is PROCESSING', async () => {
      const evaluationId = '507f1f77bcf86cd799439014';
      const evaluationDoc = {
        scores: undefined,
        status: Status.PROCESSING,
      };

      model.findById.mockResolvedValue(evaluationDoc);

      await expect(
        service.syncPostPublicationPerformance(evaluationId, {
          engagement: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when evaluation status is FAILED', async () => {
      const evaluationId = '507f1f77bcf86cd799439014';
      const evaluationDoc = {
        scores: undefined,
        status: Status.FAILED,
      };

      model.findById.mockResolvedValue(evaluationDoc);

      await expect(
        service.syncPostPublicationPerformance(evaluationId, {
          engagement: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when evaluation has no engagement scores', async () => {
      const evaluationId = '507f1f77bcf86cd799439014';
      const evaluationDoc = {
        scores: {
          brand: { overall: 85 },
          technical: { overall: 90 },
          // engagement missing
        },
        status: Status.COMPLETED,
      };

      model.findById.mockResolvedValue(evaluationDoc);

      await expect(
        service.syncPostPublicationPerformance(evaluationId, {
          engagement: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
