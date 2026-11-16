/**
 * Isolated-DB proof that one per-minute sweep run enqueues every due post, in
 * sweep order, however many are due in the same minute (#10300).
 */
import { createHash } from 'node:crypto';
import { createTestPost, generateIdString } from '@api-test/e2e/e2e-test.utils';
import { TargetExecutionState } from '@genfeedai/contracts';
import {
  createIsolatedPublishHarness,
  type IsolatedPublishFixture,
  type IsolatedPublishHarness,
  seedIsolatedPublishFixture,
} from './isolated-publish.helpers';

const MINUTE_MS = 60 * 1000;

/** The `sha256:v1:<hex>` form the approval tables' check constraints require. */
function digestOf(value: string): string {
  return `sha256:v1:${createHash('sha256').update(value).digest('hex')}`;
}

type SeededPost = {
  lastAttemptAt?: Date;
  nextScheduledDate?: Date;
  scheduledDate?: Date;
};

describe('Isolated sweep of a burst of due posts (#10300)', () => {
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
    // `clearDatabase` leaves posts and their approvals behind, and this suite
    // seeds fixed ids. The database is disposable (the lane asserts it).
    await harness.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE publish_approvals, content_version_pins, posts CASCADE',
    );
    await harness.dbHelper.clearDatabase();
    fixture = await seedIsolatedPublishFixture(harness.dbHelper);
  });

  /**
   * Inserts posts that each carry a version-bound approval, in one round trip
   * per table. Ids sort in the order given, so the order the sweep must read
   * them in is the order of the array.
   */
  async function seedDuePosts(
    posts: SeededPost[],
    prefix: string,
  ): Promise<string[]> {
    const ids = posts.map(
      (_post, index) => `${prefix}-${String(index).padStart(4, '0')}`,
    );
    await harness.prisma.user.upsert({
      create: {
        email: `${fixture.userId}@example.com`,
        handle: fixture.userId,
        id: fixture.userId,
      },
      update: {},
      where: { id: fixture.userId },
    });
    await harness.prisma.post.createMany({
      data: posts.map((post, index) =>
        createTestPost({
          brandId: fixture.brandId,
          credentialId: fixture.credentialId,
          id: ids[index],
          organizationId: fixture.organizationId,
          platform: 'twitter',
          status: 'scheduled',
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: fixture.userId,
          ...post,
        }),
      ),
    });
    await harness.prisma.contentVersionPin.createMany({
      data: ids.map((id) => ({
        contentDigest: digestOf(`content-${id}`),
        createdByUserId: fixture.userId,
        id: `pin-${id}`,
        idempotencyKey: `pin-${id}`,
        organizationId: fixture.organizationId,
        recordId: id,
        recordKind: 'post',
      })),
    });
    await harness.prisma.publishApproval.createMany({
      data: ids.map((id) => ({
        actorUserId: fixture.userId,
        artifactVersionPinId: `pin-${id}`,
        brandId: fixture.brandId,
        destinations: [{ platform: 'twitter' }],
        id: `approval-${id}`,
        operationId: digestOf(`operation-${id}`),
        organizationId: fixture.organizationId,
        policy: {},
        postId: id,
        scheduleIntent: {},
        scopeDigest: digestOf(`scope-${id}`),
        status: 'queued',
      })),
    });
    await harness.prisma.$executeRaw`
      UPDATE posts SET "publishApprovalId" = 'approval-' || id
      WHERE id LIKE ${`${prefix}-%`}
    `;
    return ids;
  }

  it('enqueues all 500 posts due in the same minute in one sweep run', async () => {
    const dueAt = new Date(Date.now() - MINUTE_MS);
    const ids = await seedDuePosts(
      Array.from({ length: 500 }, () => ({ scheduledDate: dueAt })),
      'burst',
    );

    await harness.cronPostsService.publishScheduledPosts();

    expect({
      providers: [...new Set(harness.queue.providers)],
      queued: harness.queue.jobs.map((job) => job.postId),
    }).toEqual({ providers: ['twitter'], queued: ids });
  });

  it('reads never-attempted posts first, then oldest due, without a gap or repeat across pages', async () => {
    const oldest = Date.now() - 3 * 60 * MINUTE_MS;
    const staleAttempt = new Date(Date.now() - 5 * MINUTE_MS);
    // 250 posts over three pages of 100, covering every null combination of
    // the sort keys: never attempted with a date, never attempted with only a
    // next date, and attempted long enough ago to retry.
    const neverAttempted = Array.from({ length: 120 }, (_unused, index) => ({
      scheduledDate: new Date(oldest + index * 1000),
    }));
    const neverAttemptedNextOnly = Array.from(
      { length: 30 },
      (): SeededPost => ({ nextScheduledDate: new Date(oldest) }),
    );
    const attempted = Array.from({ length: 100 }, (_unused, index) => ({
      lastAttemptAt: new Date(staleAttempt.getTime() + index * 1000),
      scheduledDate: new Date(oldest + index * 1000),
    }));
    // Ids order within each group, and the groups sort in the order sweep reads
    // them, so the seeded order is the expected order.
    const first = await seedDuePosts(neverAttempted, 'a-dated');
    const second = await seedDuePosts(neverAttemptedNextOnly, 'b-next');
    const third = await seedDuePosts(attempted, 'c-retry');

    await harness.cronPostsService.publishScheduledPosts();

    expect(harness.queue.jobs.map((job) => job.postId)).toEqual([
      ...first,
      ...second,
      ...third,
    ]);
  });

  it('leaves posts that are not due alone', async () => {
    const future = new Date(Date.now() + 60 * MINUTE_MS);
    const justAttempted = new Date();
    await seedDuePosts(
      [
        { scheduledDate: future },
        { lastAttemptAt: justAttempted, scheduledDate: new Date(0) },
      ],
      'quiet',
    );
    await harness.prisma.post.create({
      data: createTestPost({
        brandId: fixture.brandId,
        id: generateIdString(),
        organizationId: fixture.organizationId,
        platform: 'twitter',
        scheduledDate: new Date(0),
        status: 'draft',
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: fixture.userId,
      }),
    });

    await harness.cronPostsService.publishScheduledPosts();

    expect(harness.queue.jobs).toEqual([]);
  });
});
