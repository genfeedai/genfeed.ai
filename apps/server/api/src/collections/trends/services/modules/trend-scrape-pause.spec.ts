import { TrendRefreshHealthService } from '@api/collections/trends/services/modules/trend-refresh-health.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  id: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  sourceId: string;
};

/**
 * The real health service and the real refresh over an in-memory journal, so
 * the pause is read back from the receipts the refresh itself wrote.
 */
describe('a paid scrape that returns nothing night after night', () => {
  const sound = { soundId: 'sound-1', soundName: 'Sound', usageCount: 1 };
  let scrapeResult: unknown[];
  /** The UTC day of every paid scrape the refresh bought. */
  let boughtOn: string[];
  const getTikTokSounds = vi.fn(() => {
    boughtOn.push(new Date().toISOString().slice(0, 10));
    return Promise.resolve(scrapeResult);
  });
  let journal: Row[];
  let service: TrendVideoService;
  let health: TrendRefreshHealthService;

  const newestFirst = (sourceId: string) =>
    journal
      .filter((row) => row.sourceId === sourceId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    journal = [];
    scrapeResult = [];
    boughtOn = [];
    const notificationEvent = {
      findFirst: vi.fn(({ where }: { where: { sourceId: string } }) =>
        Promise.resolve(newestFirst(where.sourceId)[0] ?? null),
      ),
      findMany: vi.fn(
        ({ where, take }: { where: { sourceId: string }; take: number }) =>
          Promise.resolve(newestFirst(where.sourceId).slice(0, take)),
      ),
      upsert: vi.fn(
        ({
          create,
        }: {
          create: Omit<Row, 'id'> & { deduplicationKey: string };
        }) => {
          journal.push({ ...create, id: create.deduplicationKey });
          return Promise.resolve({ id: create.deduplicationKey });
        },
      ),
    };
    const prisma = {
      $transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ notificationEvent }),
      notificationEvent,
      trendingSound: {
        create: vi.fn().mockResolvedValue({ id: 'sound' }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    health = new TrendRefreshHealthService(prisma as never);
    service = new TrendVideoService(
      prisma as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as never,
      { getTikTokSounds } as never,
      { getTrends: vi.fn() } as never,
      health as never,
      { removeExpiredCopies: vi.fn().mockResolvedValue(0) } as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  const refreshOn = async (day: string) => {
    vi.setSystemTime(new Date(`${day}T00:15:00.000Z`));
    await service.fetchAndCacheSounds();
  };
  const breaker = () =>
    health.getScrapeBreaker({ dataset: 'sounds', platform: 'tiktok' });

  it('runs on three empty nights, opens the incident, and is skipped on the fourth', async () => {
    await refreshOn('2026-11-20');
    await refreshOn('2026-11-21');
    expect(await breaker()).toMatchObject({ emptyDays: 2, isOpen: false });

    await refreshOn('2026-11-22');
    expect(boughtOn).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);
    expect(await breaker()).toMatchObject({
      emptyDays: 3,
      isOpen: true,
      isPaused: true,
      reason: 'empty',
    });

    await refreshOn('2026-11-23');
    await refreshOn('2026-11-24');
    expect(boughtOn).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);
    expect(journal).toHaveLength(3);
  });

  it('tries the scrape once a week after its last run and closes the incident when it returns items', async () => {
    for (const day of ['2026-11-20', '2026-11-21', '2026-11-22'])
      await refreshOn(day);
    await refreshOn('2026-11-28');
    expect(boughtOn).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);

    scrapeResult = [sound];
    await refreshOn('2026-11-29');
    expect(await breaker()).toMatchObject({ isOpen: false, isPaused: false });

    await refreshOn('2026-11-30');
    expect(boughtOn.slice(3)).toEqual(['2026-11-29', '2026-11-30']);
  });

  it('keeps a probe that is empty again paused for another week', async () => {
    for (const day of ['2026-11-20', '2026-11-21', '2026-11-22'])
      await refreshOn(day);
    await refreshOn('2026-11-29');
    await refreshOn('2026-12-03');
    await refreshOn('2026-12-06');
    expect(boughtOn.slice(3)).toEqual(['2026-11-29', '2026-12-06']);
  });

  it('does not open for one empty night between nights with items', async () => {
    scrapeResult = [sound];
    await refreshOn('2026-11-20');
    scrapeResult = [];
    await refreshOn('2026-11-21');
    scrapeResult = [sound];
    await refreshOn('2026-11-22');
    await refreshOn('2026-11-23');

    expect(boughtOn).toHaveLength(4);
    expect(await breaker()).toMatchObject({ isOpen: false });
  });
});
