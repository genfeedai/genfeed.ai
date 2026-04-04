import { EvaluationsController } from '@api/collections/evaluations/controllers/evaluations.controller';
import { EvaluateContentDto } from '@api/collections/evaluations/dto/evaluate-content.dto';
import { EvaluateExternalDto } from '@api/collections/evaluations/dto/evaluate-external.dto';
import { EvaluationFiltersDto } from '@api/collections/evaluations/dto/evaluation-filters.dto';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { EvaluationType, ExternalPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('EvaluationsController', () => {
  let controller: EvaluationsController;
  let _evaluationsService: EvaluationsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/evaluations',
    query: {},
  } as unknown as import('express').Request;

  const mockEvaluation = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    brand: new Types.ObjectId('507f1f77bcf86cd799439013'),
    contentId: '507f1f77bcf86cd799439015',
    contentType: 'video',
    evaluationType: EvaluationType.PRE_PUBLICATION,
    isDeleted: false,
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    score: 85,
    user: new Types.ObjectId('507f1f77bcf86cd799439011'),
  };

  const mockServices = {
    evaluationsService: {
      evaluateContent: vi.fn().mockResolvedValue(mockEvaluation),
      evaluateExternalUrl: vi.fn().mockResolvedValue(mockEvaluation),
      findAll: vi.fn(),
      findOne: vi.fn().mockResolvedValue(mockEvaluation),
      getContentEvaluations: vi.fn().mockResolvedValue([mockEvaluation]),
      getEvaluationTrends: vi.fn().mockResolvedValue({
        averageScore: 85,
        trends: [],
      }),
      patch: vi.fn().mockResolvedValue(mockEvaluation),
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
        '507f1f77bcf86cd799439015',
        mockUser,
        dto,
      );

      expect(
        mockServices.evaluationsService.evaluateContent,
      ).toHaveBeenCalledWith(
        'post',
        '507f1f77bcf86cd799439015',
        EvaluationType.PRE_PUBLICATION,
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439013',
      );
      expect(result).toBeDefined();
    });

    it('should use default evaluation type when not provided', async () => {
      const dto: EvaluateContentDto = {};

      await controller.evaluatePost(
        mockRequest,
        '507f1f77bcf86cd799439015',
        mockUser,
        dto,
      );

      expect(
        mockServices.evaluationsService.evaluateContent,
      ).toHaveBeenCalledWith(
        'post',
        '507f1f77bcf86cd799439015',
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
        '507f1f77bcf86cd799439015',
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
      ).toHaveBeenCalledWith(
        dto,
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439013',
      );
      expect(result).toBeDefined();
    });
  });

  describe('getPostEvaluations', () => {
    it('should return evaluations for a post', async () => {
      const result = await controller.getPostEvaluations(
        mockRequest,
        '507f1f77bcf86cd799439015',
        mockUser,
      );

      expect(
        mockServices.evaluationsService.getContentEvaluations,
      ).toHaveBeenCalledWith(
        'post',
        '507f1f77bcf86cd799439015',
        '507f1f77bcf86cd799439012',
      );
      expect(result).toBeDefined();
    });
  });

  describe('getTrends', () => {
    it('should return evaluation trends', async () => {
      const filters: EvaluationFiltersDto = {
        contentType: 'video',
        endDate: '2024-12-31',
        startDate: '2024-01-01',
      };

      const result = await controller.getTrends(filters, mockUser);

      expect(
        mockServices.evaluationsService.getEvaluationTrends,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439012', filters);
      expect(result).toBeDefined();
    });
  });

  describe('deleteEvaluation', () => {
    it('should soft delete evaluation', async () => {
      const result = await controller.deleteEvaluation(
        '507f1f77bcf86cd799439014',
        mockUser,
      );

      expect(mockServices.evaluationsService.findOne).toHaveBeenCalled();
      expect(mockServices.evaluationsService.patch).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        { isDeleted: true },
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw not found when evaluation not found', async () => {
      mockServices.evaluationsService.findOne.mockResolvedValue(null);

      await expect(
        controller.deleteEvaluation('507f1f77bcf86cd799439014', mockUser),
      ).rejects.toThrow(HttpException);
    });
  });
});
