import { CronPostsService } from '@workers/crons/posts/cron.posts.service';

describe('CronPostsService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const discovery = { findDuePosts: vi.fn() };
  const discoveryFindEligible = vi.fn();
  const workflowQueue = { enqueue: vi.fn() };
  const delivery = { failTerminalValidation: vi.fn() };
  const service = new CronPostsService(
    logger as never,
    { ...discovery, findEligiblePost: discoveryFindEligible } as never,
    workflowQueue as never,
    delivery as never,
  );

  function approvalOf(n: number) {
    return {
      artifactVersionPinId: `pin-${n}`,
      id: `approval-${n}`,
      operationId: `operation-${n}`,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    discovery.findDuePosts.mockResolvedValue([]);
    workflowQueue.enqueue.mockResolvedValue('workflow-job-1');
    delivery.failTerminalValidation.mockResolvedValue({ success: false });
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
      { id: 'post-2', organizationId: 'org-2', publishApproval: approvalOf(2) },
    ]);

    await service.publishScheduledPosts();

    expect(logger.warn).toHaveBeenCalledWith(
      'Scheduled post has no organization',
      { postId: 'post-without-org' },
    );
    expect(workflowQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  describe('a due post without a valid approval', () => {
    const due = { id: 'post-3', organizationId: 'org-3', userId: 'user-3' };

    it.each([
      ['no approval at all', undefined],
      [
        'an approval without its operation',
        { ...approvalOf(3), operationId: '' },
      ],
      [
        'an approval without its version pin',
        { ...approvalOf(3), artifactVersionPinId: '  ' },
      ],
    ])(
      'is never dispatched and is closed with a message the owner can act on: %s',
      async (_label, publishApproval) => {
        discovery.findDuePosts.mockResolvedValue([{ ...due, publishApproval }]);
        discoveryFindEligible.mockResolvedValue({ ...due, publishApproval });

        await service.publishScheduledPosts();

        expect(workflowQueue.enqueue).not.toHaveBeenCalled();
        expect(delivery.failTerminalValidation).toHaveBeenCalledTimes(1);
        const error = delivery.failTerminalValidation.mock.calls[0]?.[1];
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
          'This post has no approval for its current version, so it was not published. Review it and schedule it again.',
        );
        expect(logger.error).not.toHaveBeenCalled();
      },
    );

    it('waits for the next sweep when an approval was issued since it was found', async () => {
      discovery.findDuePosts.mockResolvedValue([{ ...due }]);
      discoveryFindEligible.mockResolvedValue({
        ...due,
        publishApproval: approvalOf(3),
      });

      await service.publishScheduledPosts();

      expect(workflowQueue.enqueue).not.toHaveBeenCalled();
      expect(delivery.failTerminalValidation).not.toHaveBeenCalled();
    });

    it('leaves a post that is no longer due alone', async () => {
      discovery.findDuePosts.mockResolvedValue([{ ...due }]);
      discoveryFindEligible.mockResolvedValue(null);

      await service.publishScheduledPosts();

      expect(delivery.failTerminalValidation).not.toHaveBeenCalled();
    });

    it('does not stop the sweep when closing one post fails', async () => {
      discovery.findDuePosts.mockResolvedValue([
        { ...due },
        {
          id: 'post-4',
          organizationId: 'org-4',
          publishApproval: approvalOf(4),
        },
      ]);
      discoveryFindEligible.mockResolvedValue({ ...due });
      delivery.failTerminalValidation.mockRejectedValue(new Error('db down'));

      await service.publishScheduledPosts();

      expect(workflowQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(workflowQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ approvalId: 'approval-4', postId: 'post-4' }),
      );
    });
  });
});
