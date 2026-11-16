/**
 * Isolated-DB proof that a due post whose publish approval is already
 * PUBLISHED is settled once and never swept again (#10385). Before the fix the
 * run claimed "already published", changed nothing on the post, and the next
 * sweep queued the same run every minute.
 */
import { TargetExecutionState } from '@genfeedai/contracts';
import {
  createDraftRelease,
  createIsolatedPublishHarness,
  type IsolatedPublishFixture,
  type IsolatedPublishHarness,
  requireReleaseTargetId,
  seedIsolatedPublishFixture,
} from './isolated-publish.helpers';

const MINUTE_MS = 60 * 1000;

type SeededPost = {
  externalId?: string;
  lastAttemptAt?: Date;
  targetExecutionState: TargetExecutionState;
};

describe('Isolated sweep of posts with an already published approval (#10385)', () => {
  let fixture: IsolatedPublishFixture;
  let harness: IsolatedPublishHarness;

  beforeAll(async () => {
    harness = await createIsolatedPublishHarness();
  });

  afterAll(async () => {
    await harness?.moduleRef.close();
  });

  beforeEach(async () => {
    harness.queue.jobs.length = 0;
    harness.queue.providers.length = 0;
    harness.fakePublisher.published.length = 0;
    harness.fakePublisher.refused.length = 0;
    await harness.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE publish_approvals, content_version_pins, posts CASCADE',
    );
    await harness.dbHelper.clearDatabase();
    fixture = await seedIsolatedPublishFixture(harness.dbHelper);
  });

  /**
   * Mints a real version-bound approval through the due-now write, then sets
   * the post and approval to the state under test. `isApprovalPublished` is the
   * state the hosted loop was found in.
   */
  async function seedDuePost(
    post: SeededPost & { isApprovalPublished: boolean },
  ): Promise<string> {
    const draft = await createDraftRelease(harness, fixture);
    const targetId = requireReleaseTargetId(draft);
    await harness.postGroupsService.publishTargetNow(
      fixture.organizationId,
      fixture.userId,
      draft.id,
      targetId,
    );
    harness.queue.jobs.length = 0;
    if (post.isApprovalPublished) {
      await harness.prisma.publishApproval.updateMany({
        data: { status: 'published' },
        where: { organizationId: fixture.organizationId, postId: targetId },
      });
    }
    await harness.prisma.post.updateMany({
      data: {
        externalId: post.externalId ?? null,
        lastAttemptAt: post.lastAttemptAt ?? null,
        scheduledDate: new Date(Date.now() - 60 * MINUTE_MS),
        targetExecutionState: post.targetExecutionState,
      },
      where: { id: targetId, organizationId: fixture.organizationId },
    });
    return targetId;
  }

  async function readPost(id: string) {
    return harness.prisma.post.findFirstOrThrow({
      where: { id, organizationId: fixture.organizationId },
    });
  }

  it('settles a post that has no provider id once, then leaves it out of the next sweep', async () => {
    const postId = await seedDuePost({
      isApprovalPublished: true,
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });

    await harness.cronPostsService.publishScheduledPosts();
    expect(harness.queue.jobs.map((job) => job.postId)).toEqual([postId]);
    const [job] = harness.queue.jobs;
    if (!job) throw new Error('The sweep did not queue the post');
    await harness.executeWorkflow(job);

    const settled = await readPost(postId);
    expect(settled.targetExecutionState).toBe(TargetExecutionState.FAILED);
    expect(settled.externalId).toBeNull();
    expect(settled.url).toBeNull();
    expect(harness.fakePublisher.refused).toEqual([
      { error: expect.stringContaining('post id'), postId },
    ]);
    expect(harness.fakePublisher.published).toEqual([]);

    harness.queue.jobs.length = 0;
    await harness.cronPostsService.publishScheduledPosts();
    expect(harness.queue.jobs).toEqual([]);
  });

  it('does not sweep a post the provider accepted and that waits for its status check', async () => {
    const postId = await seedDuePost({
      externalId: 'provider-publish-id',
      isApprovalPublished: true,
      lastAttemptAt: new Date(Date.now() - 5 * MINUTE_MS),
      targetExecutionState: TargetExecutionState.PUBLISHING,
    });

    await harness.cronPostsService.publishScheduledPosts();

    expect(harness.queue.jobs).toEqual([]);
    const waiting = await readPost(postId);
    expect(waiting.targetExecutionState).toBe(TargetExecutionState.PUBLISHING);
  });

  it('still queues a due post whose approval is waiting to execute', async () => {
    const postId = await seedDuePost({
      isApprovalPublished: false,
      targetExecutionState: TargetExecutionState.SCHEDULED,
    });

    await harness.cronPostsService.publishScheduledPosts();

    expect(harness.queue.jobs.map((job) => job.postId)).toEqual([postId]);
  });
});
