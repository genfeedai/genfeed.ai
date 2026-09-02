/**
 * Isolated-DB proof that the product write path mints a version-bound
 * publish approval and enqueues only when the slot is due now (#3838).
 */
import { CredentialPlatform, ReleaseStatus } from '@genfeedai/contracts';
import {
  createDraftRelease,
  createIsolatedPublishHarness,
  type IsolatedPublishFixture,
  type IsolatedPublishHarness,
  requireReleaseTargetId,
  seedIsolatedPublishFixture,
} from './isolated-publish.helpers';

describe('Isolated publish approval mint and enqueue (#3838)', () => {
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
    await harness.dbHelper.clearDatabase();
    fixture = await seedIsolatedPublishFixture(harness.dbHelper);
  });

  it('mints a version-bound approval and enqueues due-now publish with the three ids', async () => {
    const draft = await createDraftRelease(harness, fixture);
    const targetId = requireReleaseTargetId(draft);

    await harness.postGroupsService.publishTargetNow(
      fixture.organizationId,
      fixture.userId,
      draft.id,
      targetId,
    );

    const approval = await harness.prisma.publishApproval.findFirst({
      where: {
        organizationId: fixture.organizationId,
        postId: targetId,
      },
    });

    expect(approval, 'no approval').not.toBeNull();
    expect(approval?.artifactVersionPinId, 'no version pin').toBeTruthy();
    expect(approval?.operationId, 'no operation id').toBeTruthy();

    expect(harness.queue.jobs, 'no job').toHaveLength(1);
    expect(harness.queue.jobs[0]).toEqual(
      expect.objectContaining({
        approvalId: approval?.id,
        operationId: approval?.operationId,
        organizationId: fixture.organizationId,
        postId: targetId,
        source: 'publish_now',
        versionPinId: approval?.artifactVersionPinId,
      }),
    );
  });

  it('mints a future-dated approval and does not enqueue a due-now job', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const release = await harness.postGroupsService.create(
      fixture.organizationId,
      fixture.userId,
      {
        baseContent: 'Isolated future schedule proof',
        brandId: fixture.brandId,
        scheduledDate: future,
        status: ReleaseStatus.SCHEDULED,
        targets: [
          {
            credentialId: fixture.credentialId,
            platform: CredentialPlatform.TWITTER,
            scheduledDate: future,
            settings: { replyPolicy: 'everyone' },
          },
        ],
        timezone: 'UTC',
        title: 'Isolated future schedule',
      },
    );
    const targetId = requireReleaseTargetId(release);

    const approval = await harness.prisma.publishApproval.findFirst({
      where: {
        organizationId: fixture.organizationId,
        postId: targetId,
      },
    });

    expect(approval, 'no approval').not.toBeNull();
    expect(approval?.artifactVersionPinId, 'no version pin').toBeTruthy();
    expect(approval?.operationId, 'no operation id').toBeTruthy();
    expect(harness.queue.jobs, 'unexpected due-now job').toHaveLength(0);
  });
});
