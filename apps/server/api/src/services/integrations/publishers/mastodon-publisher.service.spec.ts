vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => `decrypted:${val}`) },
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'publish') },
}));

vi.mock('@api/shared/utils/html-to-text/html-to-text.util', () => ({
  htmlToText: vi.fn((text: string) => text),
}));

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { ConfigService } from '@api/config/config.service';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { MastodonPublisherService } from '@api/services/integrations/publishers/mastodon-publisher.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, PostCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('MastodonPublisherService', () => {
  let service: MastodonPublisherService;
  let mastodonService: {
    publishStatus: ReturnType<typeof vi.fn>;
    uploadMedia: ReturnType<typeof vi.fn>;
  };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let postsService: { patch: ReturnType<typeof vi.fn> };
  let configService: {
    get: ReturnType<typeof vi.fn>;
    ingredientsEndpoint: string;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id';
  const brandId = 'test-object-id';
  const postId = 'test-object-id';

  const mockCredential = {
    _id: 'test-object-id',
    accessToken: 'enc-token',
    description: 'https://mastodon.social',
    externalHandle: '@testuser@mastodon.social',
    platform: CredentialPlatform.MASTODON,
  } as unknown as CredentialDocument;

  const makeContext = (
    overrides: Partial<PublishContext> = {},
  ): PublishContext => ({
    brandId,
    credential: mockCredential,
    organizationId: orgId,
    post: {
      _id: postId,
      category: PostCategory.TEXT,
      description: 'Hello Mastodon!',
      ingredients: [],
    } as unknown as PublishContext['post'],
    postId,
    ...overrides,
  });

  beforeEach(async () => {
    mastodonService = {
      publishStatus: vi.fn().mockResolvedValue({ id: 'ext-123' }),
      uploadMedia: vi.fn().mockResolvedValue({ id: 'media-1' }),
    };
    credentialsService = {
      findOne: vi.fn().mockResolvedValue(mockCredential),
    };
    postsService = { patch: vi.fn().mockResolvedValue(undefined) };
    configService = {
      get: vi.fn(() => 'https://webhooks.genfeed.ai'),
      ingredientsEndpoint: 'https://cdn.genfeed.ai',
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MastodonPublisherService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: MastodonService, useValue: mastodonService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: PostsService, useValue: postsService },
      ],
    }).compile();

    service = module.get(MastodonPublisherService);
  });

  it('should be defined with platform=mastodon', () => {
    expect(service).toBeDefined();
    expect(service.platform).toBe(CredentialPlatform.MASTODON);
  });

  it('should declare correct capability flags', () => {
    expect(service.supportsTextOnly).toBe(true);
    expect(service.supportsImages).toBe(true);
    expect(service.supportsVideos).toBe(true);
    expect(service.supportsCarousel).toBe(true);
    expect(service.supportsThreads).toBe(true);
  });

  describe('validatePost', () => {
    it('should return valid for normal text posts', () => {
      const context = makeContext();
      const mediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      };
      const result = service.validatePost(context, mediaInfo);
      expect(result.valid).toBe(true);
    });

    it('should reject posts with more than 4 media attachments', () => {
      const context = makeContext();
      const mediaInfo = {
        hasIngredients: true,
        ingredientIds: ['a', 'b', 'c', 'd', 'e'],
        isCarousel: true,
        isImagePost: true,
        mediaUrls: [],
      };
      const result = service.validatePost(context, mediaInfo);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('4 media attachments');
    });

    it('should reject posts with description over 500 characters', () => {
      const longText = 'a'.repeat(501);
      const context = makeContext({
        post: {
          category: PostCategory.TEXT,
          description: longText,
          ingredients: [],
        } as unknown as PublishContext['post'],
      });
      const mediaInfo = {
        hasIngredients: false,
        ingredientIds: [],
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      };
      const result = service.validatePost(context, mediaInfo);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('500 characters');
    });
  });

  describe('publish', () => {
    it('should publish a text-only post and return success result', async () => {
      const context = makeContext();
      const result = await service.publish(context);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('ext-123');
      expect(result.platform).toBe(CredentialPlatform.MASTODON);
      expect(mastodonService.publishStatus).toHaveBeenCalledWith(
        'https://mastodon.social',
        'decrypted:enc-token',
        'Hello Mastodon!',
        undefined,
      );
    });

    it('should decrypt the access token before publishing', async () => {
      await service.publish(makeContext());
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('enc-token');
    });

    it('should return failed result when credential not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      const result = await service.publish(makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('credential');
    });

    it('should upload media and pass media IDs when post has ingredients', async () => {
      const ingredientId = 'test-object-id';
      const context = makeContext({
        post: {
          _id: postId,
          category: PostCategory.IMAGE,
          description: 'Post with image',
          ingredients: [ingredientId],
        } as unknown as PublishContext['post'],
      });

      mastodonService.uploadMedia.mockResolvedValue({ id: 'media-abc' });
      mastodonService.publishStatus.mockResolvedValue({ id: 'ext-img-1' });

      const result = await service.publish(context);

      expect(mastodonService.uploadMedia).toHaveBeenCalled();
      expect(mastodonService.publishStatus).toHaveBeenCalledWith(
        'https://mastodon.social',
        'decrypted:enc-token',
        expect.any(String),
        ['media-abc'],
      );
      expect(result.success).toBe(true);
    });

    it('should rethrow errors from mastodonService.publishStatus', async () => {
      mastodonService.publishStatus.mockRejectedValue(new Error('rate limit'));

      await expect(service.publish(makeContext())).rejects.toThrow(
        'rate limit',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct mastodon URL from credential', () => {
      const cred = {
        description: 'https://mastodon.social',
        externalHandle: '@testuser',
      } as unknown as CredentialDocument;

      const url = service.buildPostUrl('12345', cred);
      expect(url).toBe('https://mastodon.social/@testuser/12345');
    });

    it('should strip leading @ and domain from handle', () => {
      const cred = {
        description: 'https://hachyderm.io',
        externalHandle: '@user@hachyderm.io',
      } as unknown as CredentialDocument;

      const url = service.buildPostUrl('99999', cred);
      expect(url).toBe('https://hachyderm.io/@user/99999');
    });

    it('should use user as fallback when no handle provided', () => {
      const cred = {
        description: 'https://mastodon.social',
        externalHandle: undefined,
      } as unknown as CredentialDocument;

      const url = service.buildPostUrl('77777', cred);
      expect(url).toBe('https://mastodon.social/@user/77777');
    });
  });
});
