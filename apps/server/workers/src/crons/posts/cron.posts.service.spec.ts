import { CronPostsService } from '@workers/crons/posts/cron.posts.service';

const APPROVAL_MISSING_MESSAGE =
  'This post has no approval for its current version, so it was not published. Review it and schedule it again.';

interface QueuedJob {
  approvalId?: string;
  operationId?: string;
  organizationId?: string;
  postId?: string;
  source?: string;
  userId?: string;
  versionPinId?: string;
}

interface ClosedPost {
  message: string;
  postId: string;
}

interface DuePost {
  id: string;
  organizationId?: string;
  publishApproval?: {
    artifactVersionPinId: string;
    id: string;
    operationId: string;
  };
  userId?: string;
}

describe('CronPostsService', () => {
  let queued: QueuedJob[];
  let closed: ClosedPost[];
  let warnings: Array<{ message: string; meta: unknown }>;
  let errors: string[];
  let duePosts: DuePost[];
  let eligiblePost: DuePost | null;
  let failClose: boolean;
  let service: CronPostsService;

  function approvalOf(n: number) {
    return {
      artifactVersionPinId: `pin-${n}`,
      id: `approval-${n}`,
      operationId: `operation-${n}`,
    };
  }

  beforeEach(() => {
    queued = [];
    closed = [];
    warnings = [];
    errors = [];
    duePosts = [];
    eligiblePost = null;
    failClose = false;

    service = new CronPostsService(
      {
        error: (message: string) => errors.push(message),
        log: () => undefined,
        warn: (message: string, meta: unknown) =>
          warnings.push({ message, meta }),
      } as never,
      {
        findDuePosts: async () => duePosts,
        findEligiblePost: async () => eligiblePost,
      } as never,
      {
        enqueue: async (job: QueuedJob) => {
          queued.push(job);
          return 'workflow-job-1';
        },
      } as never,
      {
        failTerminalValidation: async (post: DuePost, error: Error) => {
          if (failClose) {
            throw new Error('db down');
          }
          closed.push({ message: error.message, postId: post.id });
          return { success: false };
        },
      } as never,
    );
  });

  it('queues one scheduled-post workflow for every due target', async () => {
    duePosts = [
      {
        id: 'post-1',
        organizationId: 'org-1',
        publishApproval: approvalOf(1),
        userId: 'user-1',
      },
    ];

    await service.publishScheduledPosts();

    expect(queued).toEqual([
      {
        approvalId: 'approval-1',
        operationId: 'operation-1',
        organizationId: 'org-1',
        postId: 'post-1',
        source: 'scheduled_sweep',
        userId: 'user-1',
        versionPinId: 'pin-1',
      },
    ]);
  });

  it('isolates invalid posts without blocking the sweep', async () => {
    duePosts = [
      { id: 'post-without-org' },
      { id: 'post-2', organizationId: 'org-2', publishApproval: approvalOf(2) },
    ];

    await service.publishScheduledPosts();

    expect(warnings).toEqual([
      {
        message: 'Scheduled post has no organization',
        meta: { postId: 'post-without-org' },
      },
    ]);
    expect(queued.map((job) => job.postId)).toEqual(['post-2']);
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
        duePosts = [{ ...due, publishApproval }];
        eligiblePost = { ...due, publishApproval };

        await service.publishScheduledPosts();

        expect({ closed, errors, queued }).toEqual({
          closed: [{ message: APPROVAL_MISSING_MESSAGE, postId: 'post-3' }],
          errors: [],
          queued: [],
        });
      },
    );

    it('waits for the next sweep when an approval was issued since it was found', async () => {
      duePosts = [{ ...due }];
      eligiblePost = { ...due, publishApproval: approvalOf(3) };

      await service.publishScheduledPosts();

      expect({ closed, queued }).toEqual({ closed: [], queued: [] });
    });

    it('leaves a post that is no longer due alone', async () => {
      duePosts = [{ ...due }];
      eligiblePost = null;

      await service.publishScheduledPosts();

      expect({ closed, queued }).toEqual({ closed: [], queued: [] });
    });

    it('does not stop the sweep when closing one post fails', async () => {
      duePosts = [
        { ...due },
        {
          id: 'post-4',
          organizationId: 'org-4',
          publishApproval: approvalOf(4),
        },
      ];
      eligiblePost = { ...due };
      failClose = true;

      await service.publishScheduledPosts();

      expect(queued.map((job) => [job.postId, job.approvalId])).toEqual([
        ['post-4', 'approval-4'],
      ]);
    });
  });
});
