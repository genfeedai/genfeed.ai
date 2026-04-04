vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OptimizersController } from '@api/collections/optimizers/controllers/optimizers.controller';
import { AnalyzeContentDto } from '@api/collections/optimizers/dto/analyze.dto';
import { SuggestHashtagsDto } from '@api/collections/optimizers/dto/hashtags.dto';
import { OptimizeContentDto } from '@api/collections/optimizers/dto/optimize.dto';
import { GenerateVariantsDto } from '@api/collections/optimizers/dto/variants.dto';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('OptimizersController', () => {
  let controller: OptimizersController;
  let service: OptimizersService;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockOptimizersService = {
    analyzeContent: vi.fn(),
    generateVariants: vi.fn(),
    getBestPostingTimes: vi.fn(),
    getOptimizationHistory: vi.fn(),
    optimizeContent: vi.fn(),
    suggestHashtags: vi.fn(),
  };

  let mockReq: Request;

  beforeEach(async () => {
    mockReq = {} as Request;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptimizersController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: OptimizersService,
          useValue: mockOptimizersService,
        },
      ],
    })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OptimizersController>(OptimizersController);
    service = module.get<OptimizersService>(OptimizersService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('analyzeContent', () => {
    it('should analyze content and return score', async () => {
      const dto: AnalyzeContentDto = {
        content: 'Test content for analysis',
        platform: 'instagram',
      };

      const analysis = {
        score: 85,
        strengths: ['Good length', 'Engaging tone'],
        suggestions: ['Add more hashtags', 'Include a call to action'],
      };

      mockOptimizersService.analyzeContent.mockResolvedValue(analysis);

      const result = await controller.analyzeContent(mockReq, dto, mockUser);

      expect(service.analyzeContent).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        mockUser.id,
        expect.any(Function),
      );
      expect(result).toEqual(analysis);
    });
  });

  describe('optimizeContent', () => {
    it('should optimize content', async () => {
      const dto: OptimizeContentDto = {
        content: 'Original content',
        goals: ['engagement', 'reach'],
        platform: 'twitter',
      };

      const optimized = {
        improvements: ['Added trending hashtags', 'Shortened for Twitter'],
        optimized: 'Optimized content with hashtags #ai #tech',
        original: 'Original content',
      };

      mockOptimizersService.optimizeContent.mockResolvedValue(optimized);

      const result = await controller.optimizeContent(mockReq, dto, mockUser);

      expect(service.optimizeContent).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        mockUser.id,
        expect.any(Function),
      );
      expect(result).toEqual(optimized);
    });
  });

  describe('suggestHashtags', () => {
    it('should suggest relevant hashtags', async () => {
      const dto: SuggestHashtagsDto = {
        content: 'AI technology breakthrough',
        count: 10,
        platform: 'instagram',
      };

      const hashtags = {
        hashtags: ['#AI', '#Technology', '#Innovation', '#Tech'],
        trending: ['#AI', '#Tech'],
      };

      mockOptimizersService.suggestHashtags.mockResolvedValue(hashtags);

      const result = await controller.suggestHashtags(mockReq, dto, mockUser);

      expect(service.suggestHashtags).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(hashtags);
    });
  });

  describe('generateVariants', () => {
    it('should generate A/B test variants', async () => {
      const dto: GenerateVariantsDto = {
        content: 'Original post',
        count: 3,
        style: 'engaging',
      };

      const variants = {
        original: 'Original post',
        variants: [
          { content: 'Variant 1', score: 85 },
          { content: 'Variant 2', score: 82 },
          { content: 'Variant 3', score: 80 },
        ],
      };

      mockOptimizersService.generateVariants.mockResolvedValue(variants);

      const result = await controller.generateVariants(mockReq, dto, mockUser);

      expect(service.generateVariants).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(variants);
    });
  });

  describe('getBestPostingTimes', () => {
    it('should return best posting times', async () => {
      const platform = 'instagram';
      const timezone = 'America/New_York';

      const times = {
        platform,
        reasoning: 'Based on audience activity',
        times: ['14:00', '18:00', '20:00'],
        timezone,
      };

      mockOptimizersService.getBestPostingTimes.mockResolvedValue(times);

      const result = await controller.getBestPostingTimes(
        mockReq,
        platform,
        timezone,
        mockUser,
      );

      expect(service.getBestPostingTimes).toHaveBeenCalledWith(
        platform,
        timezone,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(times);
    });

    it('should use UTC as default timezone', async () => {
      const platform = 'twitter';
      const times = {
        platform,
        times: ['12:00', '16:00'],
        timezone: 'UTC',
      };

      mockOptimizersService.getBestPostingTimes.mockResolvedValue(times);

      await controller.getBestPostingTimes(
        mockReq,
        platform,
        undefined,
        mockUser,
      );

      expect(service.getBestPostingTimes).toHaveBeenCalledWith(
        platform,
        'UTC',
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
    });
  });

  describe('getOptimizationHistory', () => {
    it('should return optimization history', async () => {
      const history = [
        {
          content: 'Content 1',
          createdAt: new Date(),
          id: '1',
          score: 85,
        },
        {
          content: 'Content 2',
          createdAt: new Date(),
          id: '2',
          score: 90,
        },
      ];

      mockOptimizersService.getOptimizationHistory.mockResolvedValue(history);

      const result = await controller.getOptimizationHistory(
        mockReq,
        '20',
        mockUser,
      );

      expect(service.getOptimizationHistory).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.id,
        20,
      );
      expect(result).toEqual(history);
    });

    it('should use default limit if not provided', async () => {
      mockOptimizersService.getOptimizationHistory.mockResolvedValue([]);

      await controller.getOptimizationHistory(mockReq, undefined, mockUser);

      expect(service.getOptimizationHistory).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.id,
        20,
      );
    });
  });
});
