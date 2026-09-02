/**
 * Isolated-DB proof that the worker publishes through a fake provider when
 * the job carries a version-bound approval identity, and fail-closes when
 * that identity is missing (#3839).
 */
import { createTestPost, generateIdString } from '@api-test/e2e/e2e-test.utils';
import { TargetExecutionState } from '@genfeedai/contracts';
import {
  createDraftRelease,
  createIsolatedPublishHarness,
  ISOLATED_PUBLISH_FAKE_EXTERNAL_PREFIX,
  type IsolatedPublishFixture,
  type IsolatedPublishHarness,
  requireReleaseTargetId,
  seedIsolatedPublishFixture,
} from './isolated-publish.helpers';

describe('Isolated worker publish and refusal (#3839)', () => {
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
    harness.fakePublisher.published.length = 0;
    harness.fakePublisher.refused.length = 0;
    await harness.dbHelper.clearDatabase();
    fixture = await seedIsolatedPublishFixture(harness.dbHelper);
  });

  it('publishes through the fake publisher when the job carries a valid approval identity', async () => {
    const draft = await createDraftRelease(harness, fixture);
    const targetId = requireReleaseTargetId(draft);

    await harness.postGroupsService.publishTargetNow(
      fixture.organizationId,
      fixture.userId,
      draft.id,
      targetId,
    );

    const job = harness.queue.jobs[0];
    expect(job, 'no job').toBeDefined();
    expect(job?.approvalId, 'no approvalId').toBeTruthy();
    expect(job?.operationId, 'no operationId').toBeTruthy();
    expect(job?.versionPinId, 'no versionPinId').toBeTruthy();

    if (!job) {
      throw new Error('Due-now write did not enqueue a publish job');
    }
    const result = await harness.executeWorkflow(job);

    expect(result).toEqual(
      expect.objectContaining({
        executionState: TargetExecutionState.PUBLISHED,
        success: true,
      }),
    );
    expect(harness.fakePublisher.published).toEqual([
      expect.objectContaining({
        externalId: `${ISOLATED_PUBLISH_FAKE_EXTERNAL_PREFIX}${targetId}`,
        postId: targetId,
      }),
    ]);

    const published = await harness.prisma.post.findFirst({
      where: { id: targetId, organizationId: fixture.organizationId },
    });
    expect(published?.targetExecutionState).toBe(
      TargetExecutionState.PUBLISHED,
    );
    expect(published?.externalId).toBe(
      `${ISOLATED_PUBLISH_FAKE_EXTERNAL_PREFIX}${targetId}`,
    );
  });

  it('fails the post and the spec when the job is missing approval identity', async () => {
    const postId = generateIdString();
    await harness.dbHelper.seedCollection('posts', [
      createTestPost({
        brandId: fixture.brandId,
        credentialId: fixture.credentialId,
        id: postId,
        organizationId: fixture.organizationId,
        platform: 'twitter',
        scheduledDate: new Date(),
        status: 'scheduled',
        targetExecutionState: TargetExecutionState.SCHEDULED,
        userId: fixture.userId,
      }),
    ]);

    const result = await harness.executeWorkflow({
      organizationId: fixture.organizationId,
      postId,
      source: 'scheduled_sweep',
    });

    if ('skipped' in result) {
      throw new Error(
        'Missing-identity job was skipped instead of fail-closed',
      );
    }
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/version-bound approval identity/);
    expect(
      harness.fakePublisher.published,
      'unexpected published',
    ).toHaveLength(0);
    expect(harness.fakePublisher.refused).toEqual([
      expect.objectContaining({
        error: expect.stringContaining('version-bound approval identity'),
        postId,
      }),
    ]);

    const failed = await harness.prisma.post.findFirst({
      where: { id: postId, organizationId: fixture.organizationId },
    });
    expect(failed?.targetExecutionState).toBe(TargetExecutionState.FAILED);
  });
});
