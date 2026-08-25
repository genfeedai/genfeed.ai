import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import type { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import type { LoggerService } from '@libs/logger/logger.service';
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
    // Cast at the constructor boundary so the adapter's dependencies can grow
    // without re-fingerprinting the spec-typecheck baseline (see #2674).
    adapter = new InstagramSocialAdapter(
      mockInstagramService as unknown as InstagramService,
      mockLogger as unknown as LoggerService,
    );
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
        workflowRunId: 'workflow-run-1',
      });

      expect(mockInstagramService.postComment).toHaveBeenCalledWith(
        'org1',
        'brand1',
        'media_123',
        'Great post!',
        undefined,
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
        workflowRunId: 'workflow-run-1',
      });

      expect(mockInstagramService.sendCommentReplyDm).toHaveBeenCalledWith(
        'org1',
        'brand1',
        'user789',
        'Hey!',
        undefined,
      );
      expect(result.messageId).toBe('msg_456');
    });
  });

  describe('trigger checkers', () => {
    it('does not expose trigger checkers without real backing APIs', () => {
      expect(adapter.createFollowerChecker).toBeUndefined();
      expect(adapter.createMentionChecker).toBeUndefined();
      expect(adapter.createLikeChecker).toBeUndefined();
      expect(adapter.createRepostChecker).toBeUndefined();
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
        workflowRunId: 'workflow-run-1',
      });

      expect(mockInstagramService.postComment).toHaveBeenCalledWith(
        'org1',
        'explicit-brand',
        'media_123',
        'Great post!',
        undefined,
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
          workflowRunId: 'workflow-run-1',
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
        workflowRunId: 'workflow-run-1',
      });

      expect(mockInstagramService.sendCommentReplyDm).toHaveBeenCalledWith(
        'org1',
        'explicit-brand',
        'user789',
        'Hey!',
        undefined,
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
        workflowRunId: 'workflow-run-1',
      });

      expect(result.messageId).toMatch(/^ig_dm_\d+$/);
    });
  });
});
