vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `dec:${v}`) },
}));
vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'test') },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { SnapchatPublisherService } from '@api/services/integrations/publishers/snapchat-publisher.service';
import { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('SnapchatPublisherService', () => {
  let service: SnapchatPublisherService;
  let snapchatService: {
    createMedia: ReturnType<typeof vi.fn>;
    publishStory: ReturnType<typeof vi.fn>;
  };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const snapAdAccountId = 'snap-ad-account-001';

  const mockCredential = {
    _id: new Types.ObjectId(),
    accessToken: 'encrypted-snap-token',
    externalId: snapAdAccountId,
    platform: CredentialPlatform.SNAPCHAT,
  };

  const makeContext = (
    overrides: Partial<PublishContext> = {},
  ): PublishContext => ({
    brandId,
    credential: mockCredential as never,
    isDraft: false,
    organizationId: orgId,
    post: {
      category: PostCategory.IMAGE,
      description: 'Check this out!',
      ingredients: [new Types.ObjectId()],
      label: 'My Snap',
      status: PostStatus.DRAFT,
    } as never,
    postId: new Types.ObjectId().toString(),
    ...overrides,
  });

  beforeEach(async () => {
    snapchatService = {
      createMedia: vi.fn().mockResolvedValue('media-id-123'),
      publishStory: vi.fn().mockResolvedValue('snap-story-456'),
    };
    credentialsService = { findOne: vi.fn().mockResolvedValue(mockCredential) };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapchatPublisherService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
          },
        },
        { provide: SnapchatService, useValue: snapchatService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<SnapchatPublisherService>(SnapchatPublisherService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose correct platform capabilities', () => {
    expect(service.platform).toBe(CredentialPlatform.SNAPCHAT);
    expect(service.supportsTextOnly).toBe(false);
    expect(service.supportsImages).toBe(true);
    expect(service.supportsVideos).toBe(true);
    expect(service.supportsCarousel).toBe(false);
    expect(service.supportsThreads).toBe(false);
  });

  describe('validatePost', () => {
    it('should fail when post has no ingredients', () => {
      const result = service.validatePost(makeContext(), {
        hasIngredients: false,
        isCarousel: false,
        isImagePost: false,
        mediaUrls: [],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/media/i);
    });

    it('should fail for carousel posts', () => {
      const result = service.validatePost(makeContext(), {
        hasIngredients: true,
        isCarousel: true,
        isImagePost: false,
        mediaUrls: ['url1', 'url2'],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/carousel/i);
    });

    it('should pass for single image post', () => {
      const result = service.validatePost(makeContext(), {
        hasIngredients: true,
        isCarousel: false,
        isImagePost: true,
        mediaUrls: ['url1'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('publish', () => {
    it('should publish an image post successfully', async () => {
      const result = await service.publish(makeContext());
      expect(result.success).toBe(true);
      expect(result.externalId).toBe('snap-story-456');
    });

    it('should return failed result when credential is missing', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const result = await service.publish(makeContext());
      expect(result.success).toBe(false);
    });

    it('should return failed result when createMedia returns null', async () => {
      snapchatService.createMedia.mockResolvedValue(null);
      const result = await service.publish(makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/media/i);
    });

    it('should return failed result when publishStory returns null', async () => {
      snapchatService.publishStory.mockResolvedValue(null);
      const result = await service.publish(makeContext());
      expect(result.success).toBe(false);
    });

    it('should return failed result when post has no ingredients', async () => {
      const context = makeContext({
        post: {
          category: PostCategory.TEXT,
          description: 'text only',
          ingredients: [],
          label: 'Text',
          status: PostStatus.DRAFT,
        } as never,
      });
      const result = await service.publish(context);
      expect(result.success).toBe(false);
    });

    it('should rethrow unexpected errors', async () => {
      snapchatService.createMedia.mockRejectedValue(
        new Error('Snap API error'),
      );
      await expect(service.publish(makeContext())).rejects.toThrow(
        'Snap API error',
      );
    });
  });

  describe('buildPostUrl', () => {
    it('should build spotlight URL from externalId', () => {
      const url = service.buildPostUrl('story-789', mockCredential as never);
      expect(url).toBe('https://www.snapchat.com/spotlight/story-789');
    });
  });
});
