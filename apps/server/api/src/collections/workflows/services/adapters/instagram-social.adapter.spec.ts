import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('InstagramSocialAdapter', () => {
  let adapter: InstagramSocialAdapter;
  let mockInstagramService: {
    postComment: ReturnType<typeof vi.fn>;
    sendCommentReplyDm: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockInstagramService = {
      postComment: vi.fn().mockResolvedValue({ commentId: 'comment_123' }),
      sendCommentReplyDm: vi.fn().mockResolvedValue('msg_456'),
    };
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    };
    adapter = new InstagramSocialAdapter(mockInstagramService, mockLogger);
  });

  describe('createReplyPublisher', () => {
    it('should reply via postComment', async () => {
      const publisher = adapter.createReplyPublisher();
      const result = await publisher({
        brandId: 'brand1',
        organizationId: 'org1',
        platform: 'instagram',
        postId: 'media_123',
        text: 'Great post!',
        userId: 'brand1',
      });

      expect(mockInstagramService.postComment).toHaveBeenCalledWith(
        'org1',
        'brand1',
        'media_123',
        'Great post!',
      );
      expect(result.replyId).toBe('comment_123');
    });
  });

  describe('createDmSender', () => {
    it('should send DM via sendCommentReplyDm', async () => {
      const sender = adapter.createDmSender();
      const result = await sender({
        brandId: 'brand1',
        organizationId: 'org1',
        platform: 'instagram',
        recipientId: 'user789',
        text: 'Hey!',
        userId: 'brand1',
      });

      expect(mockInstagramService.sendCommentReplyDm).toHaveBeenCalledWith(
        'org1',
        'brand1',
        'user789',
        'Hey!',
      );
      expect(result.messageId).toBe('msg_456');
    });
  });

  describe('trigger checkers', () => {
    it('createFollowerChecker should throw not implemented error', async () => {
      const checker = adapter.createFollowerChecker();
      await expect(
        checker({
          lastFollowerId: null,
          organizationId: 'org1',
          platform: 'instagram',
        }),
      ).rejects.toThrow('Instagram follower trigger not yet implemented');
    });

    it('createMentionChecker should throw not implemented error', async () => {
      const checker = adapter.createMentionChecker();
      await expect(
        checker({
          lastMentionId: null,
          organizationId: 'org1',
          platform: 'instagram',
        }),
      ).rejects.toThrow('Instagram mention trigger not yet implemented');
    });

    it('createLikeChecker should throw not implemented error', async () => {
      const checker = adapter.createLikeChecker();
      await expect(
        checker({
          lastLikeId: null,
          organizationId: 'org1',
          platform: 'instagram',
        }),
      ).rejects.toThrow('Instagram like trigger not yet implemented');
    });

    it('createRepostChecker should throw not implemented error', async () => {
      const checker = adapter.createRepostChecker();
      await expect(
        checker({
          lastRepostId: null,
          organizationId: 'org1',
          platform: 'instagram',
        }),
      ).rejects.toThrow('Instagram repost trigger not yet implemented');
    });
  });

  describe('brandId fallback logic', () => {
    it('should use explicit brandId when provided for reply', async () => {
      const publisher = adapter.createReplyPublisher();
      await publisher({
        brandId: 'explicit-brand',
        organizationId: 'org1',
        platform: 'instagram',
        postId: 'media_123',
        text: 'Great post!',
        userId: 'legacy-user',
      });

      expect(mockInstagramService.postComment).toHaveBeenCalledWith(
        'org1',
        'explicit-brand',
        'media_123',
        'Great post!',
      );
    });

    it('should throw when brandId is not provided for reply', async () => {
      const publisher = adapter.createReplyPublisher();
      await expect(
        publisher({
          organizationId: 'org1',
          platform: 'instagram',
          postId: 'media_123',
          text: 'Great post!',
          userId: 'legacy-user',
        }),
      ).rejects.toThrow('brandId is required for Instagram reply publishing');
    });

    it('should use explicit brandId when provided for DM', async () => {
      const sender = adapter.createDmSender();
      await sender({
        brandId: 'explicit-brand',
        organizationId: 'org1',
        platform: 'instagram',
        recipientId: 'user789',
        text: 'Hey!',
        userId: 'legacy-user',
      });

      expect(mockInstagramService.sendCommentReplyDm).toHaveBeenCalledWith(
        'org1',
        'explicit-brand',
        'user789',
        'Hey!',
      );
    });

    it('should handle null messageId from sendCommentReplyDm', async () => {
      mockInstagramService.sendCommentReplyDm.mockResolvedValueOnce(null);

      const sender = adapter.createDmSender();
      const result = await sender({
        brandId: 'brand1',
        organizationId: 'org1',
        platform: 'instagram',
        recipientId: 'user789',
        text: 'Hey!',
        userId: 'brand1',
      });

      expect(result.messageId).toMatch(/^ig_dm_\d+$/);
    });
  });
});
