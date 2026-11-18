import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import { ActivityKey, CredentialPlatform } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import { deferKeptUnsettledApproval } from '@workers/services/scheduled-post-unsettled-approval';
import type { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

const HOUR_MS = 60 * 60_000;

const acceptedTweet = {
  executionState: 'published',
  externalId: 'tweet-1',
  platform: CredentialPlatform.TWITTER,
  success: true,
  url: 'https://x.com/example/status/tweet-1',
};

type WrittenData = {
  lastAttemptAt: Date;
  targetError: { code: string };
};

function createHarness(receipt: Record<string, unknown> | null) {
  const alerts: RecordActivityInput[] = [];
  const writes: WrittenData[] = [];
  const state = { isPostStillPublishing: true };
  const prisma = {
    post: {
      updateMany: async ({ data }: { data: WrittenData }) => {
        writes.push(data);
        return { count: state.isPostStillPublishing ? 1 : 0 };
      },
    },
    postProviderPublishReceipt: {
      findFirst: async () => receipt,
    },
  } as unknown as PrismaService;
  const failures = new ScheduledPostFailureService(
    {
      error: () => {},
      log: () => {},
      warn: () => {},
    } as unknown as LoggerService,
    {
      record: async (activity: RecordActivityInput) => {
        alerts.push(activity);
      },
    } as unknown as ActivityRecorderService,
    {} as unknown as SchedulerPublishStateService,
  );
  const post = {
    id: 'post-1',
    lastAttemptAt: new Date(),
    organizationId: 'org-1',
    platform: 'twitter',
    userId: 'user-1',
  } as unknown as PostEntity;
  return {
    alertKeys: () =>
      new Set(alerts.map((activity) => activity.alert?.deduplicationKey)),
    alerts,
    defer: () => deferKeptUnsettledApproval(prisma, failures, post),
    state,
    writes,
  };
}

function receiptRow(overrides: Record<string, unknown>) {
  return {
    attemptStartedAt: new Date(Date.now() - HOUR_MS),
    attemptToken: 'token-0',
    id: 'receipt-1',
    leaseRenewedAt: new Date(Date.now() - HOUR_MS),
    result: null,
    status: 'uncertain',
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('deferKeptUnsettledApproval (#10385)', () => {
  it('counts the window from the attempt start, so a post a sweep dated ahead still reaches the owner alert', async () => {
    const attemptStartedAt = new Date(Date.now() - 25 * HOUR_MS);
    const h = createHarness(receiptRow({ attemptStartedAt }));

    await h.defer();
    await h.defer();

    expect(h.writes.map((write) => write.targetError.code)).toEqual([
      'publish_outcome_unverified',
      'publish_outcome_unverified',
    ]);
    expect(h.writes[0]?.lastAttemptAt.getTime()).toBeGreaterThan(
      Date.now() + 30 * 60_000,
    );
    expect(h.alertKeys()).toEqual(
      new Set([
        `${ActivityKey.POST_PUBLISH_UNVERIFIED}/post-1/${attemptStartedAt.getTime()}`,
      ]),
    );
  });

  it('escalates once across the window boundary and keeps the hourly backoff after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const attemptStartedAt = new Date('2026-11-15T00:00:00.000Z');
    const h = createHarness(receiptRow({ attemptStartedAt }));

    const codes: string[] = [];
    for (const hoursAfterStart of [23, 24, 25, 40]) {
      vi.setSystemTime(attemptStartedAt.getTime() + hoursAfterStart * HOUR_MS);
      await h.defer();
      codes.push(h.writes.at(-1)?.targetError.code ?? '');
    }

    expect(codes).toEqual([
      'publish_outcome_unconfirmed',
      'publish_outcome_unverified',
      'publish_outcome_unverified',
      'publish_outcome_unverified',
    ]);
    expect(h.writes[2]?.lastAttemptAt.getTime()).toBeGreaterThan(
      attemptStartedAt.getTime() + 25 * HOUR_MS + 30 * 60_000,
    );
    expect(h.alerts).toHaveLength(3);
    expect(h.alertKeys()).toEqual(
      new Set([
        `${ActivityKey.POST_PUBLISH_UNVERIFIED}/post-1/${attemptStartedAt.getTime()}`,
      ]),
    );
  });

  it('uses the short backoff and tells nobody while inside the window', async () => {
    const h = createHarness(
      receiptRow({ attemptStartedAt: new Date(Date.now() - HOUR_MS) }),
    );

    await h.defer();

    expect(h.writes[0]?.targetError.code).toBe('publish_outcome_unconfirmed');
    expect(h.alerts).toEqual([]);
  });

  it('gives an attempt still in flight the short backoff and no alert', async () => {
    const h = createHarness(
      receiptRow({
        attemptStartedAt: new Date(),
        leaseRenewedAt: new Date(),
        status: 'attempting',
      }),
    );

    await h.defer();

    expect(h.writes[0]?.targetError.code).toBe('publish_outcome_unconfirmed');
    expect(h.alerts).toEqual([]);
  });

  it('escalates an accepted provider receipt that never reached the post', async () => {
    const attemptStartedAt = new Date(Date.now() - 25 * HOUR_MS);
    const h = createHarness(
      receiptRow({
        attemptStartedAt,
        result: acceptedTweet,
        status: 'accepted',
      }),
    );

    await h.defer();
    await h.defer();

    expect(h.writes.map((write) => write.targetError.code)).toEqual([
      'publish_outcome_unverified',
      'publish_outcome_unverified',
    ]);
    expect(h.alertKeys()).toEqual(
      new Set([
        `${ActivityKey.POST_PUBLISH_UNVERIFIED}/post-1/${attemptStartedAt.getTime()}`,
      ]),
    );
  });

  it('dates a post with no attempt row from now and tells nobody', async () => {
    const h = createHarness(null);

    await h.defer();

    expect(h.writes[0]?.targetError.code).toBe('publish_outcome_unconfirmed');
    expect(h.alerts).toEqual([]);
  });

  it('tells nobody when the post left publishing before the write', async () => {
    const h = createHarness(
      receiptRow({ attemptStartedAt: new Date(Date.now() - 25 * HOUR_MS) }),
    );
    h.state.isPostStillPublishing = false;

    await h.defer();

    expect(h.alerts).toEqual([]);
  });
});
