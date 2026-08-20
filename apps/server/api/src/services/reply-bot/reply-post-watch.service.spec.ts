import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { Platform, ReplyBotPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ReplyPostWatchService', () => {
  const logger = { log: vi.fn(), warn: vi.fn() };
  const socialMonitorService = {
    getContentComments: vi.fn().mockResolvedValue([
      {
        authorId: 'a1',
        authorUsername: 'viewer',
        id: 'c1',
        text: 'Great video',
      },
    ]),
  };
  const replyInboundQueueService = {
    enqueueInbound: vi.fn().mockResolvedValue({ jobId: 'j1' }),
  };
  const processedTweetsService = {
    isProcessed: vi.fn().mockResolvedValue(false),
  };

  let service: ReplyPostWatchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReplyPostWatchService(
      logger as never,
      socialMonitorService as never,
      replyInboundQueueService as never,
      processedTweetsService as never,
    );
  });

  it('defaults to Twitter and enqueues inbound without platform for legacy jobs', async () => {
    const result = await service.runWatchAttempt({
      attempt: 0,
      brandId: 'brand-1',
      maxAttempts: 4,
      organizationId: 'org-1',
      postId: 'p1',
    });

    expect(socialMonitorService.getContentComments).toHaveBeenCalledWith(
      ReplyBotPlatform.TWITTER,
      'p1',
      expect.any(Object),
    );
    expect(replyInboundQueueService.enqueueInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'twitter',
        source: 'post-watch',
      }),
    );
    expect(result.enqueued).toBe(1);
  });

  it('fetches YouTube comments and forwards platform on inbound', async () => {
    await service.runWatchAttempt({
      attempt: 0,
      brandId: 'brand-1',
      maxAttempts: 4,
      organizationId: 'org-1',
      platform: Platform.YOUTUBE,
      postId: 'video-1',
    });

    expect(socialMonitorService.getContentComments).toHaveBeenCalledWith(
      ReplyBotPlatform.YOUTUBE,
      'video-1',
      expect.any(Object),
    );
    expect(replyInboundQueueService.enqueueInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        parentPostId: 'video-1',
        platform: 'youtube',
      }),
    );
  });
});
