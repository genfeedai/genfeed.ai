import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  TargetAnalyticsCollectionState,
} from '@genfeedai/enums';
import { PostAnalyticsCollectionStateService } from '@server/analytics/services/post-analytics-collection-state.service';

function createHarness() {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const service = new PostAnalyticsCollectionStateService({
    post: { updateMany },
  } as unknown as PrismaService);

  return { service, updateMany };
}

const target = {
  brandId: 'brand-1',
  id: 'target-1',
  organizationId: 'org-1',
  platform: CredentialPlatform.TWITTER,
};

describe('PostAnalyticsCollectionStateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T06:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks canonical targets pending within organization and brand scope', async () => {
    const { service, updateMany } = createHarness();
    const requestedAt = new Date();

    await service.markPending({
      attemptKey: 'attempt-1',
      requestedAt,
      targets: [target],
    });

    expect(updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        analyticsCollectionAttemptKey: 'attempt-1',
        analyticsCollectionRequestedAt: requestedAt,
        analyticsCollectionState: TargetAnalyticsCollectionState.PENDING,
      }),
      where: {
        brandId: 'brand-1',
        groupId: { not: null },
        id: { in: ['target-1'] },
        isDeleted: false,
        organizationId: 'org-1',
        parentId: null,
        platform: CredentialPlatform.TWITTER,
      },
    });
  });

  it('guards failures by attempt key so an old worker cannot clobber a retry', async () => {
    const { service, updateMany } = createHarness();

    await service.markFailed(
      { ...target, attemptKey: 'attempt-1' },
      {
        code: 'analytics.rate_limited',
        isRetryable: true,
        message: 'Twitter analytics is temporarily rate limited.',
      },
    );

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        analyticsCollectionError: {
          code: 'analytics.rate_limited',
          failedAt: '2026-07-27T06:30:00.000Z',
          isRetryable: true,
          message: 'Twitter analytics is temporarily rate limited.',
        },
        analyticsCollectionState: TargetAnalyticsCollectionState.FAILED,
      },
      where: expect.objectContaining({
        analyticsCollectionAttemptKey: 'attempt-1',
        id: 'target-1',
        organizationId: 'org-1',
      }),
    });
  });

  it('does not mutate publish execution fields when collection becomes ready', async () => {
    const { service, updateMany } = createHarness();
    const collectedAt = new Date();

    await service.markReady(
      { ...target, attemptKey: 'attempt-1' },
      collectedAt,
    );

    const update = updateMany.mock.calls[0]?.[0];
    expect(update.data).toEqual(
      expect.objectContaining({
        analyticsCollectedAt: collectedAt,
        analyticsCollectionAttemptKey: null,
        analyticsCollectionState: TargetAnalyticsCollectionState.READY,
      }),
    );
    expect(update.data).not.toHaveProperty('status');
    expect(update.data).not.toHaveProperty('targetExecutionState');
    expect(update.data).not.toHaveProperty('targetError');
    expect(update.where).toEqual(
      expect.objectContaining({
        analyticsCollectionAttemptKey: 'attempt-1',
      }),
    );
  });
});
