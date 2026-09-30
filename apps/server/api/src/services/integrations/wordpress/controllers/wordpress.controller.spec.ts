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
  const brandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
  };
  const credentialsService = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'credential-id' },
      state: 'opaque-oauth-state',
    }),
    findPendingOAuthCredential: vi.fn().mockResolvedValue({
      brandId: 'brand-id',
      id: 'credential-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
    connectAccount: vi.fn().mockResolvedValue({
      id: 'credential-id',
      isConnected: true,
    }),
    patch: vi.fn().mockResolvedValue({
      id: 'credential-id',
      isConnected: true,
    }),
  };
  const user = {
    organizationId: 'organization-id',
    userId: 'user-id',
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WordpressController],
      providers: [
        {
          provide: WordpressService,
          useValue: {
            createPost: vi.fn().mockResolvedValue('post-123'),
            exchangeCodeForToken: vi.fn().mockResolvedValue({
              accessToken: 'wp-token',
              blogId: 'site-1',
              blogUrl: 'https://example.wordpress.com',
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
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
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

  describe('connect', () => {
    it('should return auth URL with server-issued state', async () => {
      const result = await controller.connect({} as never, user, {
        brandId: 'brand-id',
      });

      expect(wordpressService.generateAuthUrl).toHaveBeenCalledWith(
        'opaque-oauth-state',
      );
      expect(result).toEqual({
        url: 'https://public-api.wordpress.com/oauth2/authorize?...',
      });
    });
  });

  describe('verify', () => {
    it('should exchange code and persist the credential', async () => {
      const result = await controller.verify({} as never, {
        code: 'auth-code-123',
        state: 'opaque-oauth-state',
      });

      expect(wordpressService.exchangeCodeForToken).toHaveBeenCalledWith(
        'auth-code-123',
      );
      expect(credentialsService.connectAccount).toHaveBeenCalledWith(
        'credential-id',
        'organization-id',
        expect.objectContaining({
          id: 'site-1',
        }),
        { accessToken: 'wp-token' },
      );
      expect(result).toEqual({ id: 'credential-id', isConnected: true });
    });

    it('should propagate errors from token exchange', async () => {
      wordpressService.exchangeCodeForToken.mockRejectedValue(
        new Error('Invalid code'),
      );

      await expect(
        controller.verify({} as never, {
          code: 'bad-code',
          state: 'opaque-oauth-state',
        }),
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
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
