import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ThreadCommentDeliveryService } from '@workers/services/thread-comment-delivery.service';

type Mocks = ReturnType<typeof createMocks>;

function createMocks() {
  return {
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
    prisma: {
      post: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
    publisherFactory: { getPublisher: vi.fn() },
  };
}

function createService(mocks: Mocks): ThreadCommentDeliveryService {
  return new ThreadCommentDeliveryService(
    mocks.logger as never,
    mocks.prisma as never,
    mocks.organizationsService as never,
    mocks.credentialsService as never,
    mocks.publisherFactory as never,
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
});
