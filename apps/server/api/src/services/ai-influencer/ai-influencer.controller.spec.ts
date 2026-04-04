import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AiInfluencerController } from '@api/services/ai-influencer/ai-influencer.controller';
import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AiInfluencerController', () => {
  let controller: AiInfluencerController;
  let aiInfluencerService: {
    generateDailyPost: ReturnType<typeof vi.fn>;
    listPosts: ReturnType<typeof vi.fn>;
    scheduleDailyPosts: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    aiInfluencerService = {
      generateDailyPost: vi.fn(),
      listPosts: vi.fn(),
      scheduleDailyPosts: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiInfluencerController],
      providers: [
        { provide: AiInfluencerService, useValue: aiInfluencerService },
        { provide: LoggerService, useValue: loggerService },
      ],
    })
      .overrideGuard(IpWhitelistGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AiInfluencerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generatePost', () => {
    it('should return success result from generateDailyPost', async () => {
      const mockResult = {
        platform: 'instagram',
        postId: 'p-1',
        published: true,
      };
      aiInfluencerService.generateDailyPost.mockResolvedValue(mockResult);

      const result = await controller.generatePost({
        aspectRatio: '1:1',
        caption: 'Hello world',
        personaSlug: 'luna',
        platforms: ['instagram'],
        prompt: 'a stylish photo',
      });

      expect(result).toEqual({ data: mockResult, success: true });
      expect(aiInfluencerService.generateDailyPost).toHaveBeenCalledWith(
        'luna',
        ['instagram'],
        {
          aspectRatio: '1:1',
          captionOverride: 'Hello world',
          promptOverride: 'a stylish photo',
        },
      );
    });

    it('should return error response when service throws', async () => {
      aiInfluencerService.generateDailyPost.mockRejectedValue(
        new Error('generation failed'),
      );

      // ErrorResponse.handle throws HttpException
      await expect(
        controller.generatePost({
          personaSlug: 'luna',
          platforms: ['tiktok'],
        }),
      ).rejects.toThrow();
    });

    it('should pass platforms array to generateDailyPost', async () => {
      aiInfluencerService.generateDailyPost.mockResolvedValue({});

      await controller.generatePost({
        personaSlug: 'aria',
        platforms: ['instagram', 'tiktok'],
      });

      expect(aiInfluencerService.generateDailyPost).toHaveBeenCalledWith(
        'aria',
        ['instagram', 'tiktok'],
        expect.any(Object),
      );
    });
  });

  describe('scheduleDailyPosts', () => {
    it('should return results with totalGenerated count', async () => {
      const mockResults = [
        { personaSlug: 'luna', status: 'published' },
        { personaSlug: 'aria', status: 'published' },
      ];
      aiInfluencerService.scheduleDailyPosts.mockResolvedValue(mockResults);

      const result = await controller.scheduleDailyPosts();

      expect(result).toEqual({
        data: {
          results: mockResults,
          totalGenerated: 2,
        },
        success: true,
      });
    });

    it('should return zero totalGenerated when no results', async () => {
      aiInfluencerService.scheduleDailyPosts.mockResolvedValue([]);

      const result = await controller.scheduleDailyPosts();

      expect(
        (result as { data: { totalGenerated: number } }).data.totalGenerated,
      ).toBe(0);
    });

    it('should handle service error gracefully', async () => {
      aiInfluencerService.scheduleDailyPosts.mockRejectedValue(
        new Error('scheduler error'),
      );

      // ErrorResponse.handle throws HttpException
      await expect(controller.scheduleDailyPosts()).rejects.toThrow();
    });
  });

  describe('listPosts', () => {
    it('should return paginated posts with meta', async () => {
      const mockDocs = [{ _id: 'p-1', personaSlug: 'luna' }];
      aiInfluencerService.listPosts.mockResolvedValue({
        docs: mockDocs,
        limit: 20,
        page: 1,
        totalDocs: 1,
      });

      const result = await controller.listPosts({ limit: 20, page: 1 });

      expect(result).toEqual({
        data: mockDocs,
        meta: { limit: 20, page: 1, totalDocs: 1 },
        success: true,
      });
    });

    it('should forward personaSlug filter to service', async () => {
      aiInfluencerService.listPosts.mockResolvedValue({
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
      });

      await controller.listPosts({ limit: 10, page: 1, personaSlug: 'luna' });

      expect(aiInfluencerService.listPosts).toHaveBeenCalledWith({
        limit: 10,
        page: 1,
        personaSlug: 'luna',
      });
    });

    it('should handle service errors', async () => {
      aiInfluencerService.listPosts.mockRejectedValue(new Error('db error'));

      // ErrorResponse.handle throws HttpException
      await expect(
        controller.listPosts({ limit: 20, page: 1 }),
      ).rejects.toThrow();
    });

    it('should return correct totalDocs in meta', async () => {
      aiInfluencerService.listPosts.mockResolvedValue({
        docs: [],
        limit: 50,
        page: 2,
        totalDocs: 150,
      });

      const result = await controller.listPosts({ limit: 50, page: 2 });
      expect((result as { meta: { totalDocs: number } }).meta.totalDocs).toBe(
        150,
      );
    });
  });
});
