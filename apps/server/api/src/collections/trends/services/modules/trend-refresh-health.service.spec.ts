import { TrendRefreshHealthService } from '@api/collections/trends/services/modules/trend-refresh-health.service';
import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';

const receipt = (
  outcome: TrendRefreshHealth['outcome'],
  time: string,
): TrendRefreshHealth => ({
  completedAt: time,
  dataset: 'trends',
  lastAttemptAt: time,
  lastSuccessfulRefreshAt: outcome.endsWith('failed') ? null : time,
  outcome,
  platform: 'youtube',
  reason: outcome.endsWith('failed') ? 'native_failed' : null,
  scope: 'global',
});

describe('TrendRefreshHealthService', () => {
  it('persists an empty refresh, carries its success through failure, and returns sanitized cache-only evidence', async () => {
    const empty = receipt('native_empty', '2026-09-29T12:15:00.000Z');
    const failed = receipt('native_failed', '2026-09-30T00:15:00.000Z');
    const journal = {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'receipt' }),
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (transaction: unknown) => Promise<unknown>) =>
          work({ notificationEvent: journal }),
      ),
      notificationEvent: journal,
    };
    const service = new TrendRefreshHealthService(prisma as never);
    await service.record(null, [empty]);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(journal.upsert).toHaveBeenLastCalledWith({
      create: expect.objectContaining({
        organizationId: null,
        payload: empty,
        sourceType: 'trend_refresh_health',
      }),
      update: {},
      where: {
        deduplicationKey: expect.stringMatching(/^trend-refresh-health\//),
        isDeleted: false,
        organizationId: null,
      },
    });
    journal.findFirst.mockResolvedValue({ payload: empty });
    await service.record(null, [failed]);
    expect(journal.upsert.mock.calls.at(-1)?.[0].create.payload).toEqual({
      ...failed,
      lastSuccessfulRefreshAt: empty.completedAt,
    });
    journal.findFirst.mockImplementation(
      (input: { where: { OR?: unknown; sourceId: string } }) =>
        Promise.resolve(
          input.where.sourceId === 'refresh-health:youtube:trends'
            ? {
                payload: input.where.OR
                  ? empty
                  : { ...failed, reason: 'secret raw provider error' },
              }
            : null,
        ),
    );
    journal.upsert.mockClear();
    prisma.$transaction.mockClear();
    const health = await service.getHealth({ platform: 'youtube' });
    expect(health).toEqual([
      { ...failed, lastSuccessfulRefreshAt: empty.completedAt, reason: null },
    ]);
    expect(journal.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps successful concurrent evidence even when a later failure receipt could not carry it forward', async () => {
    const success = receipt('native_available', '2026-09-29T12:15:00.000Z');
    const failed = receipt('native_failed', '2026-09-30T00:15:00.000Z');
    const journal = {
      findFirst: vi
        .fn()
        .mockImplementation(
          (input: { where: { OR?: unknown; sourceId: string } }) =>
            Promise.resolve(
              input.where.sourceId === 'refresh-health:youtube:trends'
                ? { payload: input.where.OR ? success : failed }
                : null,
            ),
        ),
    };
    const service = new TrendRefreshHealthService({
      notificationEvent: journal,
    } as never);
    expect(
      (await service.getHealth({ platform: 'youtube' }))[0]
        ?.lastSuccessfulRefreshAt,
    ).toBe(success.completedAt);
  });

  it('restricts receipts to the public corpus and current tenant and excludes deleted evidence', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new TrendRefreshHealthService({
      notificationEvent: { findFirst },
    } as never);
    expect(
      await service.getHealth({ organizationId: 'org-a', platform: 'youtube' }),
    ).toEqual([]);
    expect(
      new Set(
        findFirst.mock.calls.map(([input]) => input.where.organizationId),
      ),
    ).toEqual(new Set([null, 'org-a']));
    for (const [input] of findFirst.mock.calls)
      expect(input.where).toMatchObject({
        isDeleted: false,
        sourceType: 'trend_refresh_health',
      });
  });
});

describe('TrendRefreshHealthService scrape breaker', () => {
  const now = new Date('2026-11-26T00:15:00.000Z');
  const run = (
    outcome: TrendRefreshHealth['outcome'],
    time: string,
    reason: TrendRefreshHealth['reason'] = null,
  ): TrendRefreshHealth => ({
    completedAt: time,
    dataset: 'trends',
    lastAttemptAt: time,
    lastSuccessfulRefreshAt: outcome.endsWith('failed') ? null : time,
    outcome,
    platform: 'twitter',
    reason,
    scope: 'global',
  });
  /** Receipts newest first, the way the journal returns them. */
  const breakerFor = (receipts: TrendRefreshHealth[]) =>
    new TrendRefreshHealthService({
      notificationEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue(receipts.map((payload) => ({ payload }))),
      },
    } as never).getScrapeBreaker(
      { dataset: 'trends', platform: 'twitter' },
      now,
    );

  it('raises nothing for one empty night', async () => {
    await expect(
      breakerFor([run('fallback_empty', '2026-11-25T12:15:00.000Z')]),
    ).resolves.toMatchObject({ emptyDays: 1, isOpen: false, isPaused: false });
  });

  it('counts nights, not ticks: two empty ticks on one day are one night', async () => {
    await expect(
      breakerFor([
        run('fallback_empty', '2026-11-25T12:15:00.000Z'),
        run('fallback_empty', '2026-11-25T00:15:00.000Z'),
        run('fallback_empty', '2026-11-24T12:15:00.000Z'),
      ]),
    ).resolves.toMatchObject({ emptyDays: 2, isOpen: false });
  });

  it('opens on the third empty night and pauses the scrape', async () => {
    await expect(
      breakerFor([
        run('fallback_empty', '2026-11-25T12:15:00.000Z'),
        run('fallback_empty', '2026-11-24T00:15:00.000Z'),
        run('fallback_empty', '2026-11-23T00:15:00.000Z'),
        run('fallback_available', '2026-11-22T00:15:00.000Z'),
      ]),
    ).resolves.toMatchObject({
      emptyDays: 3,
      isOpen: true,
      isPaused: true,
      reason: 'empty',
    });
  });

  it('stays closed when a night returned items between the empties', async () => {
    await expect(
      breakerFor([
        run('fallback_empty', '2026-11-25T12:15:00.000Z'),
        run('fallback_available', '2026-11-24T00:15:00.000Z'),
        run('fallback_empty', '2026-11-23T00:15:00.000Z'),
        run('fallback_empty', '2026-11-22T00:15:00.000Z'),
      ]),
    ).resolves.toMatchObject({ emptyDays: 1, isOpen: false, isPaused: false });
  });

  it('lets one run through a week after the last run, still open until it returns items', async () => {
    await expect(
      breakerFor([
        run('fallback_empty', '2026-11-19T00:15:00.000Z'),
        run('fallback_empty', '2026-11-18T00:15:00.000Z'),
        run('fallback_empty', '2026-11-17T00:15:00.000Z'),
      ]),
    ).resolves.toMatchObject({ isOpen: true, isPaused: false });
  });

  it('closes once a run returns items', async () => {
    await expect(
      breakerFor([
        run('fallback_available', '2026-11-26T00:15:00.000Z'),
        run('fallback_empty', '2026-11-19T00:15:00.000Z'),
        run('fallback_empty', '2026-11-18T00:15:00.000Z'),
        run('fallback_empty', '2026-11-17T00:15:00.000Z'),
      ]),
    ).resolves.toMatchObject({ isOpen: false, isPaused: false, reason: null });
  });

  it('opens on the first run Apify answers 404 for', async () => {
    await expect(
      breakerFor([
        run('fallback_failed', '2026-11-25T12:15:00.000Z', 'actor_unavailable'),
      ]),
    ).resolves.toMatchObject({
      isOpen: true,
      isPaused: true,
      reason: 'actor_unavailable',
    });
  });

  it('ignores receipts of a tenant scope and starts closed with no history', async () => {
    await expect(
      breakerFor([
        {
          ...run('fallback_empty', '2026-11-25T00:15:00.000Z'),
          scope: 'scoped',
        },
      ]),
    ).resolves.toMatchObject({ isOpen: false, lastRunAt: null });
    await expect(breakerFor([])).resolves.toMatchObject({ isOpen: false });
  });
});
