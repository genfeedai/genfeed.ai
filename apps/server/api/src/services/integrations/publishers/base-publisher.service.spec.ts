/**
 * @fileoverview Tests for BasePublisherService
 * @description Tests covering validatePost(), extractMediaInfo(), createFailedResult(),
 *              createSuccessResult(), sanitizeDescription() via a concrete mock subclass.
 */

import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  MediaInfo,
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { CredentialPlatform, PostCategory, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';

// ─── Concrete subclass for testing abstract base ──────────────────────────────

class TestPublisher extends BasePublisherService {
  readonly platform = CredentialPlatform.TWITTER;
  readonly supportsTextOnly: boolean = true;
  readonly supportsImages: boolean = true;
  readonly supportsVideos: boolean = true;
  readonly supportsCarousel: boolean = true;
  readonly supportsThreads: boolean = false;

  async publish(_ctx: PublishContext): Promise<PublishResult> {
    return this.createSuccessResult(
      'ext-123',
      this.platform,
      'https://x.com/post/123',
    );
  }

  buildPostUrl(externalId: string): string {
    return `https://x.com/post/${externalId}`;
  }

  // Expose protected methods for testing
  public testExtractMediaInfo(post: PostEntity): MediaInfo {
    return this.extractMediaInfo(post);
  }

  public testCreateFailedResult(
    platform: CredentialPlatform,
    error?: string,
  ): PublishResult {
    return this.createFailedResult(platform, error);
  }

  public testCreateSuccessResult(
    externalId: string,
    platform: CredentialPlatform,
    url: string,
    shortcode?: string,
  ): PublishResult {
    return this.createSuccessResult(externalId, platform, url, shortcode);
  }

  public testSanitizeDescription(desc: string | null | undefined): string {
    return this.sanitizeDescription(desc);
  }
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockPostId = new Types.ObjectId('507f1f77bcf86cd799439011');
const mockIngredientId1 = new Types.ObjectId('507f1f77bcf86cd799439021');
const mockIngredientId2 = new Types.ObjectId('507f1f77bcf86cd799439022');

function makePost(overrides: Partial<PostEntity> = {}): PostEntity {
  return {
    _id: mockPostId,
    category: PostCategory.TEXT,
    description: 'Hello world',
    ingredients: [],
    ...overrides,
  } as unknown as PostEntity;
}

function makeContext(post: PostEntity): PublishContext {
  return {
    brandId: 'brand-1',
    credential: {} as never,
    organization: {} as never,
    organizationId: 'org-1',
    post,
    postId: mockPostId.toString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BasePublisherService', () => {
  let publisher: TestPublisher;
  let mockLogger: vi.Mocked<LoggerService>;
  let mockConfig: vi.Mocked<ConfigService>;

  beforeEach(() => {
    mockLogger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    mockConfig = {
      ingredientsEndpoint: 'https://cdn.example.com',
    } as unknown as vi.Mocked<ConfigService>;

    publisher = new TestPublisher(mockConfig, mockLogger);
  });

  it('should be defined', () => {
    expect(publisher).toBeDefined();
  });

  // ─── extractMediaInfo() ────────────────────────────────────────────────────

  describe('extractMediaInfo()', () => {
    it('should return hasIngredients=false for a post with no ingredients', () => {
      const media = publisher.testExtractMediaInfo(
        makePost({ ingredients: [] }),
      );
      expect(media.hasIngredients).toBe(false);
      expect(media.ingredientIds).toHaveLength(0);
    });

    it('should return hasIngredients=true for a post with ingredients', () => {
      const media = publisher.testExtractMediaInfo(
        makePost({ ingredients: [mockIngredientId1] as never }),
      );
      expect(media.hasIngredients).toBe(true);
      expect(media.ingredientIds).toHaveLength(1);
    });

    it('should set isCarousel=true when more than one ingredient', () => {
      const media = publisher.testExtractMediaInfo(
        makePost({
          ingredients: [mockIngredientId1, mockIngredientId2] as never,
        }),
      );
      expect(media.isCarousel).toBe(true);
    });

    it('should set isCarousel=false when one ingredient', () => {
      const media = publisher.testExtractMediaInfo(
        makePost({ ingredients: [mockIngredientId1] as never }),
      );
      expect(media.isCarousel).toBe(false);
    });

    it('should build correct image mediaUrls from config endpoint', () => {
      const media = publisher.testExtractMediaInfo(
        makePost({
          category: PostCategory.IMAGE,
          ingredients: [mockIngredientId1] as never,
        }),
      );
      expect(media.mediaUrls[0]).toContain('https://cdn.example.com');
      expect(media.mediaUrls[0]).toContain('/images/');
    });

    it('should build correct video mediaUrls for VIDEO category', () => {
      const media = publisher.testExtractMediaInfo(
        makePost({
          category: PostCategory.VIDEO,
          ingredients: [mockIngredientId1] as never,
        }),
      );
      expect(media.mediaUrls[0]).toContain('/videos/');
    });
  });

  // ─── validatePost() ────────────────────────────────────────────────────────

  describe('validatePost()', () => {
    it('should pass validation for text-only post on text-supporting publisher', () => {
      const post = makePost({ category: PostCategory.TEXT, ingredients: [] });
      const media = publisher.testExtractMediaInfo(post);
      const result = publisher.validatePost(makeContext(post), media);
      expect(result.valid).toBe(true);
    });

    it('should fail text-only validation when publisher does not support text-only', () => {
      class NoTextPublisher extends TestPublisher {
        readonly supportsTextOnly: boolean = false;
      }
      const noText = new NoTextPublisher(mockConfig, mockLogger);
      const post = makePost({ category: PostCategory.TEXT, ingredients: [] });
      const media = noText.testExtractMediaInfo(post);
      const result = noText.validatePost(makeContext(post), media);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail image validation when publisher does not support images', () => {
      class NoImagePublisher extends TestPublisher {
        readonly supportsImages: boolean = false;
      }
      const noImage = new NoImagePublisher(mockConfig, mockLogger);
      const post = makePost({
        category: PostCategory.IMAGE,
        ingredients: [mockIngredientId1] as never,
      });
      const media = noImage.testExtractMediaInfo(post);
      const result = noImage.validatePost(makeContext(post), media);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('image');
    });

    it('should fail video validation when publisher does not support videos', () => {
      class NoVideoPublisher extends TestPublisher {
        readonly supportsVideos: boolean = false;
      }
      const noVideo = new NoVideoPublisher(mockConfig, mockLogger);
      const post = makePost({
        category: PostCategory.VIDEO,
        ingredients: [mockIngredientId1] as never,
      });
      const media = noVideo.testExtractMediaInfo(post);
      const result = noVideo.validatePost(makeContext(post), media);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('video');
    });

    it('should fail carousel validation when publisher does not support carousel', () => {
      class NoCarouselPublisher extends TestPublisher {
        readonly supportsCarousel: boolean = false;
      }
      const noCarousel = new NoCarouselPublisher(mockConfig, mockLogger);
      const post = makePost({
        category: PostCategory.IMAGE,
        ingredients: [mockIngredientId1, mockIngredientId2] as never,
      });
      const media = noCarousel.testExtractMediaInfo(post);
      const result = noCarousel.validatePost(makeContext(post), media);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('carousel');
    });

    it('should pass validation for image post on fully-capable publisher', () => {
      const post = makePost({
        category: PostCategory.IMAGE,
        ingredients: [mockIngredientId1] as never,
      });
      const media = publisher.testExtractMediaInfo(post);
      expect(publisher.validatePost(makeContext(post), media).valid).toBe(true);
    });
  });

  // ─── createFailedResult() ──────────────────────────────────────────────────

  describe('createFailedResult()', () => {
    it('should return a failed PublishResult with FAILED status', () => {
      const result = publisher.testCreateFailedResult(
        CredentialPlatform.TWITTER,
        'something broke',
      );
      expect(result.success).toBe(false);
      expect(result.status).toBe(PostStatus.FAILED);
      expect(result.platform).toBe(CredentialPlatform.TWITTER);
      expect(result.error).toBe('something broke');
    });

    it('should have null externalId on failure', () => {
      const result = publisher.testCreateFailedResult(
        CredentialPlatform.TWITTER,
      );
      expect(result.externalId).toBeNull();
    });

    it('should have empty url on failure', () => {
      const result = publisher.testCreateFailedResult(
        CredentialPlatform.TWITTER,
      );
      expect(result.url).toBe('');
    });
  });

  // ─── createSuccessResult() ─────────────────────────────────────────────────

  describe('createSuccessResult()', () => {
    it('should return a successful PublishResult with PUBLIC status', () => {
      const result = publisher.testCreateSuccessResult(
        'ext-456',
        CredentialPlatform.TWITTER,
        'https://x.com/post/ext-456',
      );
      expect(result.success).toBe(true);
      expect(result.status).toBe(PostStatus.PUBLIC);
      expect(result.externalId).toBe('ext-456');
      expect(result.url).toBe('https://x.com/post/ext-456');
    });

    it('should include externalShortcode when provided', () => {
      const result = publisher.testCreateSuccessResult(
        'ext-789',
        CredentialPlatform.INSTAGRAM,
        'https://instagram.com/p/short',
        'shortcode-abc',
      );
      expect(result.externalShortcode).toBe('shortcode-abc');
    });

    it('should have platform set correctly', () => {
      const result = publisher.testCreateSuccessResult(
        'id',
        CredentialPlatform.LINKEDIN,
        'https://linkedin.com/post/id',
      );
      expect(result.platform).toBe(CredentialPlatform.LINKEDIN);
    });
  });

  // ─── sanitizeDescription() ────────────────────────────────────────────────

  describe('sanitizeDescription()', () => {
    it('should return plain text for plain string input', () => {
      expect(publisher.testSanitizeDescription('Hello world')).toBe(
        'Hello world',
      );
    });

    it('should strip HTML tags', () => {
      const result = publisher.testSanitizeDescription(
        '<p>Hello <b>world</b></p>',
      );
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<b>');
      expect(result).toContain('Hello');
      expect(result).toContain('world');
    });

    it('should handle null input gracefully', () => {
      expect(() => publisher.testSanitizeDescription(null)).not.toThrow();
    });

    it('should handle undefined input gracefully', () => {
      expect(() => publisher.testSanitizeDescription(undefined)).not.toThrow();
    });

    it('should handle empty string', () => {
      expect(publisher.testSanitizeDescription('')).toBe('');
    });
  });
});
