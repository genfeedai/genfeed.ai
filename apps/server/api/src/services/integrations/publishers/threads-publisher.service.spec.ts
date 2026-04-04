import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { ThreadsPublisherService } from '@api/services/integrations/publishers/threads-publisher.service';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ThreadsPublisherService', () => {
  let service: ThreadsPublisherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreadsPublisherService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: ThreadsService,
          useValue: { publishImage: vi.fn(), publishText: vi.fn() },
        },
        {
          provide: PostsService,
          useValue: { patch: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<ThreadsPublisherService>(ThreadsPublisherService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('platform properties', () => {
    it('should have correct platform set to threads', () => {
      expect(service.platform).toBe('threads');
    });

    it('should support text-only posts', () => {
      expect(service.supportsTextOnly).toBe(true);
    });

    it('should support images', () => {
      expect(service.supportsImages).toBe(true);
    });

    it('should not support videos', () => {
      expect(service.supportsVideos).toBe(false);
    });

    it('should not support carousel', () => {
      expect(service.supportsCarousel).toBe(false);
    });

    it('should support threads/replies', () => {
      expect(service.supportsThreads).toBe(true);
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct Threads post URL with handle', () => {
      const credential = { externalHandle: 'testuser' } as never;

      const url = service.buildPostUrl('thread-123', credential);

      expect(url).toBe('https://www.threads.net/@testuser/post/thread-123');
    });

    it('should use "user" as fallback when no handle', () => {
      const credential = {} as never;

      const url = service.buildPostUrl('thread-123', credential);

      expect(url).toBe('https://www.threads.net/@user/post/thread-123');
    });
  });

  describe('validatePost', () => {
    it('should return invalid for carousel posts', () => {
      const context = {
        brandId: 'brand-1',
        credential: {},
        organizationId: 'org-1',
        post: {},
      } as never;
      const mediaInfo = {
        hasIngredients: true,
        ingredientIds: [],
        isCarousel: true,
        isImagePost: true,
        mediaUrls: [],
      } as never;

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('carousel');
    });

    it('should return invalid for video posts', () => {
      const context = {
        brandId: 'brand-1',
        credential: {},
        organizationId: 'org-1',
        post: {},
      } as never;
      const mediaInfo = {
        hasIngredients: true,
        ingredientIds: ['id'],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: ['url'],
      } as never;

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('video');
    });

    it('should return valid for text-only posts', () => {
      const context = {
        brandId: 'brand-1',
        credential: {},
        organizationId: 'org-1',
        post: { description: 'test' },
      } as never;
      const mediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      } as never;

      const result = service.validatePost(context, mediaInfo);

      expect(result.valid).toBe(true);
    });
  });

  describe('publishThreadChildren', () => {
    it('should skip when no TEXT children exist', async () => {
      const context = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        postId: 'post-1',
      } as never;
      const children = [
        {
          _id: { toString: () => 'c1' },
          category: 'image',
          description: 'img',
          order: 0,
        },
      ];

      const mockThreadsService = service['threadsService'];

      await service.publishThreadChildren(
        context,
        children,
        'parent-thread-id',
      );

      expect(mockThreadsService.publishText).not.toHaveBeenCalled();
    });

    it('should publish TEXT children as replies in order', async () => {
      const context = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        postId: 'post-1',
      } as never;
      const children = [
        {
          _id: { toString: () => 'c2' },
          category: 'text',
          description: 'Second reply',
          order: 2,
        },
        {
          _id: { toString: () => 'c1' },
          category: 'text',
          description: 'First reply',
          order: 1,
        },
      ];

      const mockThreadsService = service['threadsService'];
      (mockThreadsService.publishText as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ threadId: 'reply-1' })
        .mockResolvedValueOnce({ threadId: 'reply-2' });

      const mockPostsService = service['postsService'];

      await service.publishThreadChildren(
        context,
        children,
        'parent-thread-id',
      );

      // First call should reply to parent
      expect(mockThreadsService.publishText).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'First reply',
        'parent-thread-id',
      );
      // Second call should reply to previous reply (chain)
      expect(mockThreadsService.publishText).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'Second reply',
        'reply-1',
      );
      expect(mockPostsService.patch).toHaveBeenCalledTimes(2);
    });

    it('should mark child as failed when publishText fails', async () => {
      const context = {
        brandId: 'brand-1',
        organizationId: 'org-1',
        postId: 'post-1',
      } as never;
      const children = [
        {
          _id: { toString: () => 'c1' },
          category: 'text',
          description: 'Reply',
          order: 1,
        },
      ];

      const mockThreadsService = service['threadsService'];
      (
        mockThreadsService.publishText as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('API error'));

      const mockPostsService = service['postsService'];

      await service.publishThreadChildren(
        context,
        children,
        'parent-thread-id',
      );

      expect(mockPostsService.patch).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          status: 'failed',
        }),
      );
    });
  });
});
