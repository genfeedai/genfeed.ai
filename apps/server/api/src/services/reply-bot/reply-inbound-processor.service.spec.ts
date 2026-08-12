import { ReplyInboundProcessorService } from '@api/services/reply-bot/reply-inbound-processor.service';
import { ReplyBotPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ReplyInboundProcessorService', () => {
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const processedTweetsService = {
    isProcessed: vi.fn().mockResolvedValue(false),
    markAsProcessed: vi.fn(),
  };
  const authorReplyLoopService = {
    findResponderOwnerUserId: vi.fn().mockResolvedValue('user-1'),
    sendReply: vi.fn().mockResolvedValue({ success: true }),
  };

  let service: ReplyInboundProcessorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReplyInboundProcessorService(
      logger as never,
      processedTweetsService as never,
      authorReplyLoopService as never,
    );
  });

  it('forwards platform to sendReply (youtube)', async () => {
    const result = await service.process({
      brandId: 'brand-1',
      commentAuthorUsername: 'viewer',
      commentId: 'c1',
      commentText: 'Great video!',
      organizationId: 'org-1',
      parentPostId: 'v1',
      platform: 'youtube',
      receivedAt: new Date().toISOString(),
      source: 'manual',
    });

    expect(result.success).toBe(true);
    expect(
      authorReplyLoopService.findResponderOwnerUserId,
    ).toHaveBeenCalledWith('org-1', 'brand-1', ReplyBotPlatform.YOUTUBE);
    expect(authorReplyLoopService.sendReply).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: ReplyBotPlatform.YOUTUBE,
      }),
    );
  });

  it('defaults platform to twitter when omitted', async () => {
    await service.process({
      brandId: 'brand-1',
      commentAuthorUsername: 'reader',
      commentId: 'c2',
      commentText: 'Nice take',
      organizationId: 'org-1',
      parentPostId: 'p1',
      receivedAt: new Date().toISOString(),
      source: 'xaa',
    });

    expect(
      authorReplyLoopService.findResponderOwnerUserId,
    ).toHaveBeenCalledWith('org-1', 'brand-1', ReplyBotPlatform.TWITTER);
    expect(authorReplyLoopService.sendReply).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: ReplyBotPlatform.TWITTER,
      }),
    );
  });
});
