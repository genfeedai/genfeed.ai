import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';
import {
  HEALTH_LOOKUP_CONCURRENCY,
  TrendIngestionHealthService,
} from '@workers/services/trend-ingestion-health.service';

const enrollment = new Date('2026-09-28T00:15:00.000Z');
function setup() {
  const events = new Map<
    string,
    { deduplicationKey: string; occurredAt: Date; sourceId: string }
  >();
  const prisma = {
    $transaction: vi.fn(
      async (work: (transaction: unknown) => Promise<unknown>) => work(prisma),
    ),
    credential: { findMany: vi.fn().mockResolvedValue([]) },
    notificationEvent: {
      upsert: vi.fn().mockResolvedValue({ id: 'enrollment' }),
      findFirstOrThrow: vi.fn().mockResolvedValue({ occurredAt: enrollment }),
      findFirst: vi
        .fn()
        .mockImplementation((input: { where: { sourceId: string } }) =>
          Promise.resolve(
            [...events.values()]
              .filter(
                (event) =>
                  event.sourceId === input.where.sourceId &&
                  !event.deduplicationKey.endsWith('/recovered'),
              )
              .sort(
                (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
              )[0] ?? null,
          ),
        ),
    },
  };
  const health = { getHealth: vi.fn().mockResolvedValue([]) };
  const recorder = {
    dispatch: vi
      .fn()
      .mockImplementation(
        (input: {
          deduplicationKey: string;
          occurredAt: Date;
          source: { id: string };
        }) => {
          events.set(input.deduplicationKey, {
            deduplicationKey: input.deduplicationKey,
            occurredAt: input.occurredAt,
            sourceId: input.source.id,
          });
          return Promise.resolve();
        },
      ),
  };
  return {
    events,
    health,
    prisma,
    recorder,
    service: new TrendIngestionHealthService(
      prisma as never,
      health as never,
      recorder as never,
    ),
  };
}

describe('TrendIngestionHealthService', () => {
  it('waits for two closed scheduled windows, emits actionable alerts once, and deduplicates continued failure', async () => {
    const { service, recorder, events, prisma } = setup();
    await service.checkMissedWindows(new Date('2026-09-28T12:15:00.000Z'));
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.notificationEvent.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        deduplicationKey: 'trend-ingestion-health/enrollment-v1',
        organizationId: null,
      }),
      update: {},
      where: {
        deduplicationKey: 'trend-ingestion-health/enrollment-v1',
        isDeleted: false,
        organizationId: null,
      },
    });
    expect(prisma.notificationEvent.findFirstOrThrow).toHaveBeenCalledWith({
      select: { occurredAt: true },
      where: { id: 'enrollment', isDeleted: false, organizationId: null },
    });
    await service.checkMissedWindows(new Date('2026-09-29T00:14:59.999Z'));
    expect(recorder.dispatch).not.toHaveBeenCalled();
    await service.checkMissedWindows(new Date('2026-09-29T00:15:00.000Z'));
    expect(events.size).toBe(15);
    expect(recorder.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        topic: 'operator.alerts',
        messages: [
          expect.objectContaining({
            message: expect.objectContaining({
              action: 'ingestion_health',
              payload: expect.objectContaining({
                card: expect.objectContaining({
                  description: expect.stringContaining(
                    'Inspect the trend maintenance queue',
                  ),
                }),
              }),
            }),
          }),
        ],
      }),
    );
    const keys = [...events.keys()];
    await service.checkMissedWindows(new Date('2026-09-29T12:15:00.000Z'));
    expect([...events.keys()]).toEqual(keys);
  });

  it.each([
    'native_empty',
    'fallback_empty',
    'native_available',
    'fallback_available',
  ] as const)(
    'treats %s as successful and emits one recovery per incident before rearming',
    async (outcome) => {
      const { service, events, health } = setup();
      await service.checkMissedWindows(new Date('2026-09-29T00:15:00.000Z'));
      const receipt: TrendRefreshHealth = {
        completedAt: '2026-09-29T01:00:00.000Z',
        dataset: 'trends',
        lastAttemptAt: '2026-09-29T00:59:00.000Z',
        lastSuccessfulRefreshAt: '2026-09-29T01:00:00.000Z',
        outcome,
        platform: 'youtube',
        reason: null,
        scope: 'global',
      };
      health.getHealth.mockResolvedValue([receipt]);
      await service.checkMissedWindows(new Date('2026-09-29T12:15:00.000Z'));
      expect(
        [...events.keys()].filter((key) => key.endsWith('/recovered')),
      ).toHaveLength(1);
      await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
      expect(
        [...events.keys()].filter((key) => key.endsWith('/recovered')),
      ).toHaveLength(1);
      await service.checkMissedWindows(new Date('2026-09-30T12:15:00.000Z'));
      expect(
        [...events.keys()].filter(
          (key) =>
            key.startsWith('trend-ingestion-health/youtube/trends/missed/') &&
            !key.endsWith('/recovered'),
        ),
      ).toHaveLength(2);
    },
  );
  it('does not let healthy global fallbacks conceal missed connected-provider windows', async () => {
    const { service, health, prisma, events, recorder } = setup();
    prisma.credential.findMany.mockResolvedValue([
      {
        createdAt: enrollment,
        organizationId: 'private-org',
        platform: 'YOUTUBE',
      },
    ]);
    health.getHealth.mockResolvedValue([
      {
        completedAt: '2026-09-28T23:00:00.000Z',
        dataset: 'trends',
        lastAttemptAt: '2026-09-28T23:00:00.000Z',
        lastSuccessfulRefreshAt: '2026-09-28T23:00:00.000Z',
        outcome: 'fallback_available',
        platform: 'youtube',
        reason: 'native_failed',
        scope: 'global',
      },
    ]);
    await service.checkMissedWindows(new Date('2026-09-29T00:15:00.000Z'));
    expect(
      [...events.keys()].some((key) =>
        key.includes('youtube/trends/scoped/missed/'),
      ),
    ).toBe(true);
    expect(JSON.stringify(recorder.dispatch.mock.calls)).not.toContain(
      'private-org',
    );
  });
  it('counts a successful response exactly at a window boundary as evidence for that window', async () => {
    const { service, health, events } = setup();
    health.getHealth.mockResolvedValue([
      {
        completedAt: enrollment.toISOString(),
        dataset: 'trends',
        lastAttemptAt: enrollment.toISOString(),
        lastSuccessfulRefreshAt: enrollment.toISOString(),
        outcome: 'native_empty',
        platform: 'youtube',
        reason: null,
        scope: 'global',
      },
    ]);
    await service.checkMissedWindows(new Date('2026-09-29T00:15:00.000Z'));
    expect(
      [...events.keys()].some((key) =>
        key.startsWith('trend-ingestion-health/youtube/trends/missed/'),
      ),
    ).toBe(false);
    await service.checkMissedWindows(new Date('2026-09-29T12:15:00.000Z'));
    expect(
      [...events.keys()].filter((key) =>
        key.startsWith('trend-ingestion-health/youtube/trends/missed/'),
      ),
    ).toHaveLength(1);
  });

  it('bounds concurrent per-scope health lookups', async () => {
    const { service, health, prisma } = setup();
    prisma.credential.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => ({
        createdAt: enrollment,
        organizationId: `org-${index}`,
        platform: 'YOUTUBE',
      })),
    );
    let inFlight = 0;
    let peak = 0;
    health.getHealth.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return [];
    });
    await service.checkMissedWindows(new Date('2026-09-29T00:15:00.000Z'));
    expect(health.getHealth).toHaveBeenCalledTimes(51);
    expect(peak).toBeLessThanOrEqual(HEALTH_LOOKUP_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it('sends one alert per platform with the affected tenant count during an outage', async () => {
    const { service, health, prisma, events, recorder } = setup();
    prisma.credential.findMany.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => ({
        createdAt: enrollment,
        organizationId: `org-${index}`,
        platform: 'YOUTUBE',
      })),
    );
    health.getHealth.mockResolvedValue([]);
    await service.checkMissedWindows(new Date('2026-09-29T00:15:00.000Z'));
    const scoped = [...events.keys()].filter((key) =>
      key.startsWith('trend-ingestion-health/youtube/trends/scoped/missed/'),
    );
    expect(scoped).toHaveLength(1);
    const calls = JSON.stringify(recorder.dispatch.mock.calls);
    expect(calls).toContain('30 of 30 connected tenant scopes');
    expect(calls).not.toContain('org-1');
    await service.checkMissedWindows(new Date('2026-09-29T12:15:00.000Z'));
    expect(
      [...events.keys()].filter((key) => key.includes('/scoped/missed/')),
    ).toEqual(scoped);
  });
});
