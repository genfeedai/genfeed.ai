import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { EvaluationsController } from '@api/collections/evaluations/controllers/evaluations.controller';
import { CompareEvaluationsDto } from '@api/collections/evaluations/dto/compare-evaluations.dto';
import { EvaluateContentDto } from '@api/collections/evaluations/dto/evaluate-content.dto';
import { EvaluateExternalDto } from '@api/collections/evaluations/dto/evaluate-external.dto';
import { EvaluationFiltersDto } from '@api/collections/evaluations/dto/evaluation-filters.dto';
import { RecordEvaluationReviewDto } from '@api/collections/evaluations/dto/record-evaluation-review.dto';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  EvaluationType,
  ExternalPlatform,
  IngredientCategory,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('EvaluationsController', () => {
  let controller: EvaluationsController;
  let _evaluationsService: EvaluationsService;

  const organizationId = testId('org');
  const brandId = testId('brand');
  const userId = testId('user');
  const evaluationId = testId('evaluation');
  const contentId = testId('content');

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/evaluations',
    query: {},
  } as unknown as import('express').Request;

  const mockEvaluation = {
    id: evaluationId,
    contentId,
    contentType: IngredientCategory.VIDEO,
    data: {
      brandId,
      evaluationType: EvaluationType.PRE_PUBLICATION,
      overallScore: 85,
    },
    isDeleted: false,
    organizationId,
    userId,
  };

  const mockServices = {
    evaluationsService: {
      compareEvaluations: vi.fn().mockResolvedValue({
        comparedAt: '2026-07-02T00:00:00.000Z',
        evaluationIds: ['evaluation-a', 'evaluation-b'],
        rankings: [],
      }),
      evaluateContent: vi.fn().mockResolvedValue(mockEvaluation),
      evaluateExternalUrl: vi.fn().mockResolvedValue(mockEvaluation),
      findAll: vi.fn(),
      findOne: vi.fn().mockResolvedValue(mockEvaluation),
      getEvaluationTrends: vi.fn().mockResolvedValue({
        averageScore: 85,
        trends: [],
      }),
      patch: vi.fn().mockResolvedValue(mockEvaluation),
      recordReviewerFeedback: vi.fn().mockResolvedValue(mockEvaluation),
    },
    loggerService: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EvaluationsController],
      providers: [
        {
          provide: EvaluationsService,
          useValue: mockServices.evaluationsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EvaluationsController>(EvaluationsController);
    _evaluationsService = module.get<EvaluationsService>(EvaluationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('evaluatePost', () => {
    it('should evaluate a post', async () => {
      const dto: EvaluateContentDto = {
        evaluationType: EvaluationType.PRE_PUBLICATION,
      };

      const result = await controller.evaluatePost(
        mockRequest,
        contentId,
        mockUser,
        dto,
      );

      expect(
        mockServices.evaluationsService.evaluateContent,
      ).toHaveBeenCalledWith(
        'post',
        contentId,
        EvaluationType.PRE_PUBLICATION,
        organizationId,
        userId,
        brandId,
      );
      expect(result).toBeDefined();
    });

    it('should use default evaluation type when not provided', async () => {
      const dto: EvaluateContentDto = {};

      await controller.evaluatePost(mockRequest, contentId, mockUser, dto);

      expect(
        mockServices.evaluationsService.evaluateContent,
      ).toHaveBeenCalledWith(
        'post',
        contentId,
        EvaluationType.PRE_PUBLICATION,
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('evaluateVideo', () => {
    it('should evaluate a video', async () => {
      const dto: EvaluateContentDto = {
        evaluationType: EvaluationType.PRE_PUBLICATION,
      };

      const result = await controller.evaluateVideo(
        mockRequest,
        contentId,
        mockUser,
        dto,
      );

      expect(
        mockServices.evaluationsService.evaluateContent,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('evaluateExternal', () => {
    it('should evaluate external content', async () => {
      const dto: EvaluateExternalDto = {
        platform: ExternalPlatform.YOUTUBE,
        url: 'https://example.com/video',
      };

      const result = await controller.evaluateExternal(
        mockRequest,
        dto,
        mockUser,
      );

      expect(
        mockServices.evaluationsService.evaluateExternalUrl,
      ).toHaveBeenCalledWith(dto, organizationId, userId, brandId);
      expect(result).toBeDefined();
    });
  });

  describe('buildFindAllQuery', () => {
    it('should scope by organization and filter by entityType/entityId', () => {
      const query = {
        entityId: contentId,
        entityType: 'posts' as const,
      };

      const result = controller.buildFindAllQuery(mockUser, query);

      expect(result.where).toMatchObject({
        contentId: contentId,
        contentType: 'post',
        isDeleted: false,
        organizationId: organizationId,
      });
    });

    it('should scope by organization without entityType/entityId', () => {
      const result = controller.buildFindAllQuery(mockUser, {});

      expect(result.where).toMatchObject({
        isDeleted: false,
        organizationId: organizationId,
      });
      expect(
        (result.where as Record<string, unknown>).contentType,
      ).toBeUndefined();
    });
  });

  describe('getTrends', () => {
    it('should return evaluation trends', async () => {
      const filters: EvaluationFiltersDto = {
        contentType: IngredientCategory.VIDEO,
        endDate: '2024-12-31',
        startDate: '2024-01-01',
      };

      const result = await controller.getTrends(filters, mockUser);

      expect(
        mockServices.evaluationsService.getEvaluationTrends,
      ).toHaveBeenCalledWith(organizationId, filters);
      expect(result).toBeDefined();
    });
  });

  describe('compareEvaluations', () => {
    it('should compare evaluations for the current organization', async () => {
      const dto: CompareEvaluationsDto = {
        evaluationIds: ['evaluation-a', 'evaluation-b'],
      };

      const result = await controller.compareEvaluations(dto, mockUser);

      expect(
        mockServices.evaluationsService.compareEvaluations,
      ).toHaveBeenCalledWith(organizationId, dto);
      expect(result).toBeDefined();
    });
  });

  describe('recordReviewerFeedback', () => {
    it('should record reviewer feedback for the current organization user', async () => {
      const dto: RecordEvaluationReviewDto = {
        comment: 'Use this model for launch posts.',
        decision: 'approved',
        reviewerScore: 91,
        tags: ['launch'],
      };

      const result = await controller.recordReviewerFeedback(
        mockRequest,
        evaluationId,
        mockUser,
        dto,
      );

      expect(
        mockServices.evaluationsService.recordReviewerFeedback,
      ).toHaveBeenCalledWith(evaluationId, organizationId, userId, dto);
      expect(result).toBeDefined();
    });
  });

  describe('deleteEvaluation', () => {
    it('should soft delete evaluation', async () => {
      const result = await controller.deleteEvaluation(evaluationId, mockUser);

      expect(mockServices.evaluationsService.findOne).toHaveBeenCalled();
      expect(mockServices.evaluationsService.patch).toHaveBeenCalledWith(
        evaluationId,
        { isDeleted: true },
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw not found when evaluation not found', async () => {
      mockServices.evaluationsService.findOne.mockResolvedValue(null);

      await expect(
        controller.deleteEvaluation(evaluationId, mockUser),
      ).rejects.toThrow(HttpException);
    });
  });
});
