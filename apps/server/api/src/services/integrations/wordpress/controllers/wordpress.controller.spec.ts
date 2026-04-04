import { WordpressController } from '@api/services/integrations/wordpress/controllers/wordpress.controller';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('WordpressController', () => {
  let controller: WordpressController;
  let wordpressService: {
    createPost: ReturnType<typeof vi.fn>;
    exchangeCodeForToken: ReturnType<typeof vi.fn>;
    generateAuthUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WordpressController],
      providers: [
        {
          provide: WordpressService,
          useValue: {
            createPost: vi.fn().mockResolvedValue('post-123'),
            exchangeCodeForToken: vi.fn().mockResolvedValue({
              access_token: 'wp-token',
              blog_id: 'site-1',
            }),
            generateAuthUrl: vi
              .fn()
              .mockReturnValue(
                'https://public-api.wordpress.com/oauth2/authorize?...',
              ),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(WordpressController);
    wordpressService = module.get(WordpressService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAuthUrl', () => {
    it('should return auth URL with provided state', () => {
      const result = controller.getAuthUrl('my-state');

      expect(wordpressService.generateAuthUrl).toHaveBeenCalledWith('my-state');
      expect(result).toEqual({
        data: {
          url: 'https://public-api.wordpress.com/oauth2/authorize?...',
        },
      });
    });

    it('should use empty string when state is not provided', () => {
      const result = controller.getAuthUrl(undefined as unknown as string);

      expect(wordpressService.generateAuthUrl).toHaveBeenCalledWith('');
      expect(result).toEqual({
        data: {
          url: 'https://public-api.wordpress.com/oauth2/authorize?...',
        },
      });
    });
  });

  describe('exchangeToken', () => {
    it('should exchange code for token and return result', async () => {
      const result = await controller.exchangeToken({ code: 'auth-code-123' });

      expect(wordpressService.exchangeCodeForToken).toHaveBeenCalledWith(
        'auth-code-123',
      );
      expect(result).toEqual({
        data: { access_token: 'wp-token', blog_id: 'site-1' },
      });
    });

    it('should propagate errors from token exchange', async () => {
      wordpressService.exchangeCodeForToken.mockRejectedValue(
        new Error('Invalid code'),
      );

      await expect(
        controller.exchangeToken({ code: 'bad-code' }),
      ).rejects.toThrow('Invalid code');
    });
  });

  describe('createPost', () => {
    it('should create a post and return the post ID', async () => {
      const body = {
        accessToken: 'wp-token',
        content: '<p>Hello World</p>',
        siteId: 'site-1',
        title: 'Test Post',
      };

      const result = await controller.createPost(body);

      expect(wordpressService.createPost).toHaveBeenCalledWith(
        'wp-token',
        'site-1',
        'Test Post',
        '<p>Hello World</p>',
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual({ data: { id: 'post-123' } });
    });

    it('should pass optional parameters to createPost', async () => {
      const body = {
        accessToken: 'wp-token',
        categories: ['tech', 'ai'],
        content: '<p>Content</p>',
        featuredImage: 'https://example.com/image.jpg',
        siteId: 'site-1',
        status: 'draft',
        tags: ['genfeed'],
        title: 'Draft Post',
      };

      await controller.createPost(body);

      expect(wordpressService.createPost).toHaveBeenCalledWith(
        'wp-token',
        'site-1',
        'Draft Post',
        '<p>Content</p>',
        'draft',
        ['tech', 'ai'],
        ['genfeed'],
        'https://example.com/image.jpg',
      );
    });

    it('should propagate errors from post creation', async () => {
      wordpressService.createPost.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        controller.createPost({
          accessToken: 'bad-token',
          content: 'test',
          siteId: 'site-1',
          title: 'Test',
        }),
      ).rejects.toThrow('Unauthorized');
    });
  });
});
