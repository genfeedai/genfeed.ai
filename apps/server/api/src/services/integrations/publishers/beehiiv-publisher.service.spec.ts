import { ConfigService } from '@api/config/config.service';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { BeehiivPublisherService } from './beehiiv-publisher.service';

describe('BeehiivPublisherService', () => {
  let service: BeehiivPublisherService;

  let mockBeehiivService: {
    createPost: ReturnType<typeof vi.fn>;
    getDecryptedApiKey: ReturnType<typeof vi.fn>;
  };

  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };

  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockCredential = {
    _id: 'cred-id',
    platform: CredentialPlatform.BEEHIIV,
  };

  const baseContext: PublishContext = {
    brandId: 'brand-123',
    credential: mockCredential as never,
    isDraft: false,
    organizationId: 'org-123',
    post: {
      description: '<p>Post content</p>',
      ingredients: [],
      label: 'My Newsletter',
    } as never,
    postId: 'post-123',
  };

  beforeEach(async () => {
    mockBeehiivService = {
      createPost: vi.fn().mockResolvedValue({
        id: 'beehiiv-post-id',
        web_url: 'https://example.beehiiv.com/p/my-newsletter',
      }),
      getDecryptedApiKey: vi.fn().mockResolvedValue({
        apiKey: 'test-api-key',
        publicationId: 'pub-456',
      }),
    };

    mockConfigService = {
      get: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeehiivPublisherService,
        { provide: BeehiivService, useValue: mockBeehiivService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<BeehiivPublisherService>(BeehiivPublisherService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have platform set to BEEHIIV', () => {
    expect(service.platform).toBe(CredentialPlatform.BEEHIIV);
  });

  it('should support text only and images but not videos or carousel', () => {
    expect(service.supportsTextOnly).toBe(true);
    expect(service.supportsImages).toBe(true);
    expect(service.supportsVideos).toBe(false);
    expect(service.supportsCarousel).toBe(false);
    expect(service.supportsThreads).toBe(false);
  });

  describe('publish', () => {
    it('should successfully publish a post and return success result', async () => {
      const result = await service.publish(baseContext);

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('beehiiv-post-id');
      expect(result.url).toBe('https://example.beehiiv.com/p/my-newsletter');
    });

    it('should call getDecryptedApiKey with organizationId and brandId', async () => {
      await service.publish(baseContext);

      expect(mockBeehiivService.getDecryptedApiKey).toHaveBeenCalledWith(
        'org-123',
        'brand-123',
      );
    });

    it('should call createPost with decrypted credentials', async () => {
      await service.publish(baseContext);

      expect(mockBeehiivService.createPost).toHaveBeenCalledWith(
        'test-api-key',
        'pub-456',
        'My Newsletter',
        '<p>Post content</p>',
        'confirmed',
      );
    });

    it('should pass "draft" status when isDraft is true', async () => {
      await service.publish({ ...baseContext, isDraft: true });

      expect(mockBeehiivService.createPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'draft',
      );
    });

    it('should use "Untitled" when post label is missing', async () => {
      const context: PublishContext = {
        ...baseContext,
        post: { ...baseContext.post, label: undefined } as never,
      };

      await service.publish(context);

      expect(mockBeehiivService.createPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'Untitled',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should use empty string for content when description is missing', async () => {
      const context: PublishContext = {
        ...baseContext,
        post: { ...baseContext.post, description: undefined } as never,
      };

      await service.publish(context);

      expect(mockBeehiivService.createPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        '',
        expect.anything(),
      );
    });

    it('should return failed result when createPost returns no id', async () => {
      mockBeehiivService.createPost.mockResolvedValue({ id: null });

      const result = await service.publish(baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should propagate errors from beehiivService and log them', async () => {
      const error = new Error('API rate limit exceeded');
      mockBeehiivService.createPost.mockRejectedValue(error);

      await expect(service.publish(baseContext)).rejects.toThrow(
        'API rate limit exceeded',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use web_url from response when available', async () => {
      mockBeehiivService.createPost.mockResolvedValue({
        id: 'post-id',
        web_url: 'https://newsletter.example.com/p/title',
      });

      const result = await service.publish(baseContext);

      expect(result.url).toBe('https://newsletter.example.com/p/title');
    });
  });

  describe('buildPostUrl', () => {
    it('should return empty string (URLs come from Beehiiv API)', () => {
      const url = service.buildPostUrl('ext-id', mockCredential as never);
      expect(url).toBe('');
    });
  });
});
