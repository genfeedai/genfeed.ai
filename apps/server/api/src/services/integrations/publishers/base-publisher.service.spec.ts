/**
 * @fileoverview Tests for BasePublisherService
 * @description Tests covering validatePost(), extractMediaInfo(), createFailedResult(),
 *              createSuccessResult(), sanitizeDescription() via a concrete mock subclass.
 */

import type { ServerLogger } from '@api/server.dependencies';
import type {
  MediaInfo,
  PublishContext,
  PublisherPostInput,
  PublishResult,
  ThreadChild,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { Mocked } from 'vitest';
import { BasePublisherService } from './base-publisher.service';

type TestCommentResult = { commentId?: string | null } | null | undefined;

type TestThreadChildUpdate = {
  externalId?: string;
  publicationDate?: Date;
  targetExecutionState: TargetExecutionState;
};

// ─── Concrete subclass for testing abstract base ──────────────────────────────

class TestPublisher extends BasePublisherService {
  readonly platform: CredentialPlatform = CredentialPlatform.TWITTER;
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
  public testExtractMediaInfo(post: PublisherPostInput): MediaInfo {
    return this.extractMediaInfo(post);
  }

  public testCreateFailedResult(
    platform: CredentialPlatform,
    error?: string,
    errorCode?: string,
  ): PublishResult {
    return this.createFailedResult(platform, error, errorCode);
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

  public testPublishTextChildrenAsComments(
    context: PublishContext,
    children: ThreadChild[],
    publishComment: (text: string) => Promise<TestCommentResult>,
    updateChild: (
      childId: string,
      update: TestThreadChildUpdate,
    ) => Promise<unknown>,
  ): Promise<void> {
    return this.publishTextChildrenAsComments({
      children,
      context,
      logPrefix: 'TestPublisher publishThreadChildren',
      parentExternalId: 'parent-1',
      publishComment,
      updateChild,
    });
  }
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockPostId = testId('post');
const mockIngredientId1 = testId('ingredient');
const mockIngredientId2 = testId('ingredient', 2);

function makePost(
  overrides: Partial<PublisherPostInput> = {},
): PublisherPostInput {
  return {
    category: PostCategory.TEXT,
    description: 'Hello world',
    id: mockPostId,
    ingredients: [],
    label: 'Test post',
    scheduledDate: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeContext(post: PublisherPostInput): PublishContext {
  return {
    settings: {},
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
  let mockLogger: Mocked<ServerLogger>;
  let mockConfig: { ingredientsEndpoint: string };

  beforeEach(() => {
    mockLogger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<ServerLogger>;

    mockConfig = {
      ingredientsEndpoint: 'https://cdn.example.com',
    };

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

  // ─── caption length via the channel capability catalog ─────────────────────

  describe('validateCaptionLength() via validatePost()', () => {
    // TestPublisher is TWITTER; the catalog caption limit for X is 280.
    it('should pass a caption exactly at the catalog limit', () => {
      const post = makePost({ description: 'a'.repeat(280) });
      const media = publisher.testExtractMediaInfo(post);
      expect(publisher.validatePost(makeContext(post), media).valid).toBe(true);
    });

    it('should fail an over-limit caption with a structured caption_too_long error', () => {
      const post = makePost({ description: 'a'.repeat(281) });
      const media = publisher.testExtractMediaInfo(post);
      const result = publisher.validatePost(makeContext(post), media);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('caption_too_long');
      expect(result.error).toContain('X (Twitter)');
      expect(result.error).toContain('281');
      expect(result.error).toContain('280');
    });

    it('should count the sanitized text, not the raw HTML markup', () => {
      // Raw HTML is over 280 characters; the visible text is well under.
      const post = makePost({
        description: `<p>${'<strong>ab</strong> '.repeat(20)}</p>`,
      });
      const media = publisher.testExtractMediaInfo(post);
      expect(publisher.validatePost(makeContext(post), media).valid).toBe(true);
    });

    it('should skip the check for a platform without a catalog entry', () => {
      class NoCatalogPublisher extends TestPublisher {
        readonly platform: CredentialPlatform = CredentialPlatform.FANVUE;
      }
      const noCatalog = new NoCatalogPublisher(mockConfig, mockLogger);
      const post = makePost({ description: 'a'.repeat(10_000) });
      const media = noCatalog.testExtractMediaInfo(post);
      expect(noCatalog.validatePost(makeContext(post), media).valid).toBe(true);
    });
  });

  // ─── createFailedResult() ──────────────────────────────────────────────────

  describe('createFailedResult()', () => {
    it('should return a failed PublishResult with FAILED lifecycle', () => {
      const result = publisher.testCreateFailedResult(
        CredentialPlatform.TWITTER,
        'something broke',
      );
      expect(result.success).toBe(false);
      expect(result.executionState).toBe(TargetExecutionState.FAILED);
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

    it('should carry the errorCode when provided', () => {
      const result = publisher.testCreateFailedResult(
        CredentialPlatform.TWITTER,
        'caption too long',
        'caption_too_long',
      );
      expect(result.errorCode).toBe('caption_too_long');
    });
  });

  // ─── createSuccessResult() ─────────────────────────────────────────────────

  describe('createSuccessResult()', () => {
    it('should return a successful PublishResult with PUBLISHED lifecycle', () => {
      const result = publisher.testCreateSuccessResult(
        'ext-456',
        CredentialPlatform.TWITTER,
        'https://x.com/post/ext-456',
      );
      expect(result.success).toBe(true);
      expect(result.executionState).toBe(TargetExecutionState.PUBLISHED);
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

  describe('publishTextChildrenAsComments()', () => {
    it('filters, orders, sanitizes, and persists successful text comments', async () => {
      const publishComment = vi
        .fn<(text: string) => Promise<TestCommentResult>>()
        .mockResolvedValueOnce({ commentId: 'comment-1' })
        .mockResolvedValueOnce({ commentId: 'comment-2' });
      const updateChild = vi
        .fn<
          (childId: string, update: TestThreadChildUpdate) => Promise<unknown>
        >()
        .mockResolvedValue(undefined);
      const children: ThreadChild[] = [
        {
          category: PostCategory.TEXT,
          description: '<p>Second</p>',
          id: 'child-2',
          order: 2,
        },
        {
          category: PostCategory.IMAGE,
          description: 'Ignored',
          id: 'child-image',
          order: 0,
        },
        {
          category: PostCategory.TEXT,
          description: '<strong>First</strong>',
          id: 'child-1',
          order: 1,
        },
      ];

      await publisher.testPublishTextChildrenAsComments(
        makeContext(makePost()),
        children,
        publishComment,
        updateChild,
      );

      expect(publishComment.mock.calls.map(([text]) => text)).toEqual([
        'First',
        'Second',
      ]);
      expect(updateChild).toHaveBeenNthCalledWith(1, 'child-1', {
        externalId: 'comment-1',
        publicationDate: expect.any(Date),
        targetExecutionState: TargetExecutionState.PUBLISHED,
      });
      expect(updateChild).toHaveBeenNthCalledWith(2, 'child-2', {
        externalId: 'comment-2',
        publicationDate: expect.any(Date),
        targetExecutionState: TargetExecutionState.PUBLISHED,
      });
    });

    it('marks failed comments and continues after provider errors', async () => {
      const publishComment = vi
        .fn<(text: string) => Promise<TestCommentResult>>()
        .mockRejectedValueOnce(new Error('provider failed'))
        .mockResolvedValueOnce({ commentId: null })
        .mockResolvedValueOnce({ commentId: 'comment-3' });
      const updateChild = vi
        .fn<
          (childId: string, update: TestThreadChildUpdate) => Promise<unknown>
        >()
        .mockResolvedValue(undefined);
      const children: ThreadChild[] = ['child-1', 'child-2', 'child-3'].map(
        (id, index) => ({
          category: PostCategory.TEXT,
          description: id,
          id,
          order: index,
        }),
      );

      await publisher.testPublishTextChildrenAsComments(
        makeContext(makePost()),
        children,
        publishComment,
        updateChild,
      );

      expect(publishComment).toHaveBeenCalledTimes(3);
      expect(updateChild).toHaveBeenNthCalledWith(1, 'child-1', {
        targetExecutionState: TargetExecutionState.FAILED,
      });
      expect(updateChild).toHaveBeenNthCalledWith(2, 'child-2', {
        targetExecutionState: TargetExecutionState.FAILED,
      });
      expect(updateChild).toHaveBeenNthCalledWith(3, 'child-3', {
        externalId: 'comment-3',
        publicationDate: expect.any(Date),
        targetExecutionState: TargetExecutionState.PUBLISHED,
      });
    });
  });
});
