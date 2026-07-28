import { PostStatus } from '@genfeedai/enums';
import type { PostPublishJobData } from '@genfeedai/queue-contracts';
import { ScheduledPostQueueService } from '@workers/services/scheduled-post-queue.service';

describe('ScheduledPostQueueService', () => {
  const postsService = {
    findAll: vi.fn(),
  };
  const postPublishQueueService = {
    enqueue: vi.fn(),
  };
  const publishApprovalsService = {
    markQueued: vi.fn(),
  };
  const logger = {
    warn: vi.fn(),
  };

  const service = new ScheduledPostQueueService(
    logger as never,
    postsService as never,
    postPublishQueueService as never,
    publishApprovalsService as never,
  );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T06:00:00.000Z'));
    postsService.findAll.mockResolvedValue({ docs: [] });
    postPublishQueueService.enqueue.mockResolvedValue('job-1');
    publishApprovalsService.markQueued.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('queries only due root posts outside the retry backoff', async () => {
    await service.findDuePosts();

    expect(postsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { lastAttemptAt: null },
                {
                  lastAttemptAt: {
                    lte: new Date('2026-07-28T05:59:00.000Z'),
                  },
                },
              ],
            },
          ],
          OR: [
            {
              scheduledDate: {
                lte: new Date('2026-07-28T06:00:00.000Z'),
              },
            },
            {
              nextScheduledDate: {
                lte: new Date('2026-07-28T06:00:00.000Z'),
              },
            },
          ],
          isDeleted: false,
          parentId: null,
          status: { in: [PostStatus.SCHEDULED, PostStatus.PROCESSING] },
        },
      }),
      expect.objectContaining({ limit: 50, page: 1 }),
    );
  });

  it('scopes queued post lookup to one post and organization', async () => {
    const job: PostPublishJobData = {
      enqueuedAt: '2026-07-28T06:00:00.000Z',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
    };

    await expect(service.findQueuedPost(job)).resolves.toBeNull();
    expect(postsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'post-1',
          organizationId: 'org-1',
        }),
      }),
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('marks an approval queued before preserving its bound queue identity', async () => {
    await service.enqueueDuePosts([
      {
        id: 'post-1',
        organizationId: 'org-1',
        publishApproval: {
          artifactVersionPinId: 'pin-1',
          id: 'approval-1',
          operationId: 'operation-1',
        },
      } as never,
    ]);

    expect(publishApprovalsService.markQueued).toHaveBeenCalledWith(
      'approval-1',
      'org-1',
    );
    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });
    expect(
      publishApprovalsService.markQueued.mock.invocationCallOrder[0],
    ).toBeLessThan(
      postPublishQueueService.enqueue.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('preserves a durable review pin when no approval is attached', async () => {
    await service.enqueueDuePosts([
      {
        id: 'post-1',
        organization: { id: 'org-1' },
        reviewVersionPinId: 'pin-1',
      } as never,
    ]);

    expect(postPublishQueueService.enqueue).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      versionPinId: 'pin-1',
    });
  });

  it('skips enqueueing when the post has no durable organization identity', async () => {
    await service.enqueueDuePosts([{ id: 'post-1' } as never]);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing organization'),
      { postId: 'post-1' },
    );
    expect(postPublishQueueService.enqueue).not.toHaveBeenCalled();
  });
});
