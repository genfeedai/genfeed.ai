import { CronPostsService } from '@workers/crons/posts/cron.posts.service';

describe('CronPostsService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const discovery = { findDuePosts: vi.fn() };
  const workflowQueue = { enqueue: vi.fn() };
  const service = new CronPostsService(
    logger as never,
    discovery as never,
    workflowQueue as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    discovery.findDuePosts.mockResolvedValue([]);
    workflowQueue.enqueue.mockResolvedValue('workflow-job-1');
  });

  it('queues one scheduled-post workflow for every due target', async () => {
    discovery.findDuePosts.mockResolvedValue([
      {
        id: 'post-1',
        organizationId: 'org-1',
        publishApproval: {
          artifactVersionPinId: 'pin-1',
          id: 'approval-1',
          operationId: 'operation-1',
        },
        userId: 'user-1',
      },
    ]);

    await service.publishScheduledPosts();

    expect(workflowQueue.enqueue).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      operationId: 'operation-1',
      organizationId: 'org-1',
      postId: 'post-1',
      source: 'scheduled_sweep',
      userId: 'user-1',
      versionPinId: 'pin-1',
    });
  });

  it('isolates invalid posts without blocking the sweep', async () => {
    discovery.findDuePosts.mockResolvedValue([
      { id: 'post-without-org' },
      { id: 'post-2', organizationId: 'org-2' },
    ]);

    await service.publishScheduledPosts();

    expect(logger.warn).toHaveBeenCalledWith(
      'Scheduled post has no organization',
      { postId: 'post-without-org' },
    );
    expect(workflowQueue.enqueue).toHaveBeenCalledTimes(1);
  });
});
