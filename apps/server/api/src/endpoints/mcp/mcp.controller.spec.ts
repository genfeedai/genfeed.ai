import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { MCPController } from '@api/endpoints/mcp/mcp.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs ?? data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

describe('MCPController', () => {
  let controller: MCPController;
  let videosService: vi.Mocked<VideosService>;
  let analyticsService: vi.Mocked<AnalyticsService>;

  const mockCreateVideoDto: CreateVideoDto = {
    aspectRatio: '16:9',
    duration: 30,
    model: 'openai-sora',
    prompt: 'Test prompt',
  };

  const mockBaseQueryDto: BaseQueryDto = {
    limit: 10,
    order: 'desc',
    page: 1,
    sort: 'createdAt',
  };

  const mockRequest = {
    headers: {},
    originalUrl: '/mcp/videos',
    url: '/mcp/videos',
    user: {
      id: 'clerk_user_123',
      publicMetadata: {
        brand: '507f1f77bcf86cd799439010',
        organization: '507f1f77bcf86cd799439011',
        user: '507f1f77bcf86cd799439012',
      },
    },
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MCPController],
      providers: [
        {
          provide: VideosService,
          useValue: {
            create: vi.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            findAll: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModelsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<MCPController>(MCPController);
    videosService = module.get(VideosService);
    analyticsService = module.get(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createVideo', () => {
    it('should create video through VideosService', async () => {
      const mockVideoData = {
        _id: '507f1f77bcf86cd799439015',
        status: 'processing',
        title: 'Test Video',
      };

      videosService.create.mockResolvedValue(mockVideoData as never);

      await controller.createVideo(mockRequest, mockCreateVideoDto);

      expect(videosService.create).toHaveBeenCalledWith(mockCreateVideoDto);
    });

    it('should handle video creation error', async () => {
      const error = new Error('Video creation failed');
      videosService.create.mockRejectedValue(error);

      await expect(
        controller.createVideo(mockRequest, mockCreateVideoDto),
      ).rejects.toThrow('Video creation failed');
    });
  });

  describe('getAnalytics', () => {
    it('should get analytics through AnalyticsService', async () => {
      const mockAnalyticsData = [
        {
          _id: '507f1f77bcf86cd799439016',
          type: 'video',
          views: 100,
        },
      ];

      analyticsService.findAll.mockResolvedValue(mockAnalyticsData as never);

      await controller.getAnalytics(mockRequest, mockBaseQueryDto);

      expect(analyticsService.findAll).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          limit: mockBaseQueryDto.limit,
          page: mockBaseQueryDto.page,
        }),
      );
    });

    it('should handle analytics retrieval error', async () => {
      const error = new Error('Analytics retrieval failed');
      analyticsService.findAll.mockRejectedValue(error);

      await expect(
        controller.getAnalytics(mockRequest, mockBaseQueryDto),
      ).rejects.toThrow('Analytics retrieval failed');
    });
  });

  describe('controller methods', () => {
    it('should have createVideo method defined', () => {
      expect(controller.createVideo).toBeDefined();
    });

    it('should have getAnalytics method defined', () => {
      expect(controller.getAnalytics).toBeDefined();
    });
  });
});
