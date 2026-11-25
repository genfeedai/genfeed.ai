import { XPostingBillingGate } from '@api/common/subscriptions/x-posting-billing-gate.service';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ScheduledPostXBilling } from '@workers/services/scheduled-post-x-billing';
import { ThreadCommentDeliveryService } from '@workers/services/thread-comment-delivery.service';

type Mocks = ReturnType<typeof createMocks>;

function createMocks() {
  return {
    credits: {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    },
    credentialsService: {
      findOne: vi.fn().mockResolvedValue({
        id: 'cred-1',
        platform: CredentialPlatform.TWITTER,
      }),
    },
    logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    organizationsService: {
      findOne: vi.fn().mockResolvedValue({ id: 'org-1' }),
    },
    paidAccess: { isSubscriptionGatedFresh: vi.fn().mockResolvedValue(false) },
    prisma: {
      post: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
    publisherFactory: { getPublisher: vi.fn() },
    sweepLease: {
      extend: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
    },
    sweepLock: { acquire: vi.fn() },
  };
}

function createService(mocks: Mocks): ThreadCommentDeliveryService {
  if (!mocks.sweepLock.acquire.getMockImplementation()) {
    mocks.sweepLock.acquire.mockResolvedValue(mocks.sweepLease);
  }
  return new ThreadCommentDeliveryService(
    mocks.logger as never,
    mocks.prisma as never,
    mocks.organizationsService as never,
    mocks.credentialsService as never,
    mocks.publisherFactory as never,
    mocks.sweepLock as never,
    new ScheduledPostXBilling(
      mocks.logger as never,
      new XPostingBillingGate(
        mocks.paidAccess as never,
        mocks.credits as never,
      ),
      mocks.credits as never,
      mocks.prisma as never,
      { get: () => 'https://app.genfeed.ai' } as never,
    ),
  );
}

function createParent(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    category: PostCategory.TEXT,
    createdAt: new Date('2026-09-10T11:00:00.000Z'),
    credentialId: 'cred-1',
    description: 'Parent caption',
    externalId: 'parent-external-1',
    id: 'post-1',
    ingredients: [],
    label: null,
    organizationId: 'org-1',
    platform: CredentialPlatform.TWITTER,
    publishedAt: new Date('2026-09-10T12:00:00.000Z'),
    scheduledDate: new Date('2026-09-10T12:00:00.000Z'),
    targetSettings: {},
    visibility: null,
    ...overrides,
  };
}

function createChild(overrides: Record<string, unknown> = {}) {
  return {
    category: PostCategory.TEXT,
    description: 'Delayed comment',
    id: 'child-1',
    ingredients: [],
    order: 1,
    organizationId: 'org-1',
    parentId: 'post-1',
    retryCount: 0,
    threadDelayMinutes: 10,
    ...overrides,
  };
}

describe('ThreadCommentDeliveryService', () => {
  let mocks: Mocks;
  let publishThreadChildren: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks = createMocks();
    publishThreadChildren = vi.fn().mockResolvedValue(undefined);
    mocks.publisherFactory.getPublisher.mockReturnValue({
      publishThreadChildren,
      supportsThreads: true,
    });
  });

  it('does nothing when no comment is due', async () => {
    await createService(mocks).publishDueThreadComments();

    expect(mocks.prisma.post.findFirst).not.toHaveBeenCalled();
    expect(publishThreadChildren).not.toHaveBeenCalled();
  });

  it('only looks for delayed comments behind a published parent', async () => {
    await createService(mocks).publishDueThreadComments();

    const where = mocks.prisma.post.findMany.mock.calls[0]?.[0]?.where;
    expect(where.threadDelayMinutes).toEqual({ gt: 0 });
    expect(where.parentId).toEqual({ not: null });
    expect(where.parent.is.externalId).toEqual({ not: null });
    expect(where.parent.is.targetExecutionState).toBe(
      TargetExecutionState.PUBLISHED,
    );
  });

  it('continues an X reply chain from the last published sibling', async () => {
    mocks.prisma.post.findMany.mockResolvedValue([createChild({ order: 2 })]);
    mocks.prisma.post.findFirst
      .mockResolvedValueOnce(createParent())
      .mockResolvedValueOnce({ externalId: 'sibling-external-1' });

    await createService(mocks).publishDueThreadComments();

    expect(publishThreadChildren).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', postId: 'post-1' }),
      [expect.objectContaining({ id: 'child-1' })],
      'sibling-external-1',
    );
  });

  it('charges an X comment once the publisher sent it', async () => {
    mocks.prisma.post.findMany.mockResolvedValue([
      createChild({ description: 'Plain follow-up' }),
    ]);
    mocks.prisma.post.findFirst
      .mockResolvedValueOnce(createParent({ userId: 'user-1' }))
      .mockResolvedValueOnce({ externalId: 'sibling-external-1' });

    await createService(mocks).publishDueThreadComments();

    expect(mocks.credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      3,
      'X post published',
      expect.anything(),
      expect.objectContaining({ idempotencyKey: 'x-post-publish:child-1' }),
    );
  });

  it('charges nothing for an X comment the publisher did not send', async () => {
    mocks.prisma.post.findMany
      .mockResolvedValueOnce([createChild()])
      .mockResolvedValue([]);
    mocks.prisma.post.findFirst
      .mockResolvedValueOnce(createParent())
      .mockResolvedValueOnce({ externalId: 'sibling-external-1' });

    await createService(mocks).publishDueThreadComments();

    expect(publishThreadChildren).toHaveBeenCalled();
    expect(mocks.credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('charges nothing for a comment on another channel', async () => {
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.LINKEDIN,
    });
    mocks.prisma.post.findMany.mockResolvedValue([createChild()]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(
      createParent({ platform: CredentialPlatform.LINKEDIN }),
    );

    await createService(mocks).publishDueThreadComments();

    expect(mocks.credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('anchors a comment channel on the parent post', async () => {
    mocks.credentialsService.findOne.mockResolvedValue({
      id: 'cred-1',
      platform: CredentialPlatform.LINKEDIN,
    });
    mocks.prisma.post.findMany.mockResolvedValue([createChild()]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(
      createParent({ platform: CredentialPlatform.LINKEDIN }),
    );

    await createService(mocks).publishDueThreadComments();

    expect(publishThreadChildren).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'parent-external-1',
    );
    // A comment never chains, so no sibling lookup happens.
    expect(mocks.prisma.post.findFirst).toHaveBeenCalledTimes(1);
  });

  it('holds a comment back while an earlier one is still waiting', async () => {
    mocks.prisma.post.findMany.mockResolvedValue([createChild({ order: 3 })]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(createParent());
    mocks.prisma.post.count.mockResolvedValue(1);

    await createService(mocks).publishDueThreadComments();

    expect(publishThreadChildren).not.toHaveBeenCalled();
  });

  it('fails the comments when the parent channel cannot publish them', async () => {
    mocks.publisherFactory.getPublisher.mockReturnValue({
      supportsThreads: false,
    });
    mocks.prisma.post.findMany.mockResolvedValue([createChild()]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(createParent());

    await createService(mocks).publishDueThreadComments();

    expect(mocks.prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
      }),
    );
  });

  it('never sends a delayed comment of a breakout response, whose parent is already published', async () => {
    mocks.prisma.post.findMany.mockResolvedValue([createChild()]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(
      createParent({ breakoutOutputId: 'output-1' }),
    );

    await createService(mocks).publishDueThreadComments();

    expect(publishThreadChildren).not.toHaveBeenCalled();
    expect(mocks.publisherFactory.getPublisher).not.toHaveBeenCalled();
    expect(mocks.prisma.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetExecutionState: TargetExecutionState.FAILED,
        }),
        where: expect.objectContaining({ id: 'child-1' }),
      }),
    );
  });

  it('still sends the delayed comments of an ordinary post', async () => {
    mocks.prisma.post.findMany.mockResolvedValue([createChild()]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(
      createParent({ breakoutOutputId: null }),
    );

    await createService(mocks).publishDueThreadComments();

    expect(publishThreadChildren).toHaveBeenCalledOnce();
  });

  it('leaves a comment scheduled for another attempt after a provider throw', async () => {
    publishThreadChildren.mockRejectedValue(new Error('provider down'));
    mocks.prisma.post.findMany.mockResolvedValue([createChild()]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(createParent());

    await createService(mocks).publishDueThreadComments();

    const states = mocks.prisma.post.updateMany.mock.calls.map(
      ([args]) => args.data.targetExecutionState,
    );
    expect(states).not.toContain(TargetExecutionState.FAILED);
  });

  it('gives up on a comment that has used all its attempts', async () => {
    publishThreadChildren.mockRejectedValue(new Error('provider down'));
    mocks.prisma.post.findMany.mockResolvedValue([
      createChild({ retryCount: 2 }),
    ]);
    mocks.prisma.post.findFirst.mockResolvedValueOnce(createParent());

    await createService(mocks).publishDueThreadComments();

    const states = mocks.prisma.post.updateMany.mock.calls.map(
      ([args]) => args.data.targetExecutionState,
    );
    expect(states).toContain(TargetExecutionState.FAILED);
  });

  describe('claiming a comment', () => {
    it('does not send a comment whose claim matched nothing, nor the later ones of its thread', async () => {
      mocks.prisma.post.findMany.mockResolvedValue([
        createChild({ id: 'child-1', order: 1 }),
        createChild({ id: 'child-2', order: 2 }),
      ]);
      mocks.prisma.post.findFirst.mockResolvedValueOnce(createParent());
      mocks.prisma.post.updateMany.mockResolvedValue({ count: 0 });

      await createService(mocks).publishDueThreadComments();

      expect(publishThreadChildren).not.toHaveBeenCalled();
      expect(mocks.prisma.post.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('sweep lock', () => {
    it('does nothing while another run holds the lock', async () => {
      mocks.sweepLock.acquire.mockResolvedValue(null);

      await createService(mocks).publishDueThreadComments();

      expect(mocks.prisma.post.findMany).not.toHaveBeenCalled();
      expect(publishThreadChildren).not.toHaveBeenCalled();
      expect(mocks.sweepLease.release).not.toHaveBeenCalled();
    });

    it('releases its own lock when the sweep is done, even after a failure', async () => {
      mocks.prisma.post.findMany.mockRejectedValue(new Error('db down'));

      await createService(mocks).publishDueThreadComments();

      expect(mocks.sweepLock.acquire).toHaveBeenCalledWith(
        'genfeed:lock:thread-comment-sweep',
      );
      expect(mocks.sweepLease.release).toHaveBeenCalledOnce();
    });

    it('stops sending when the lock was lost', async () => {
      mocks.prisma.post.findMany.mockResolvedValue([createChild()]);
      mocks.prisma.post.findFirst.mockResolvedValueOnce(createParent());
      mocks.sweepLease.extend.mockResolvedValue(false);

      await createService(mocks).publishDueThreadComments();

      expect(publishThreadChildren).not.toHaveBeenCalled();
      expect(mocks.sweepLease.release).toHaveBeenCalledOnce();
    });
  });
});
