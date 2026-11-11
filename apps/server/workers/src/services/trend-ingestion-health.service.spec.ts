import type { TrendRefreshHealth } from '@genfeedai/contracts/interfaces';
import {
  HEALTH_LOOKUP_CONCURRENCY,
  type PendingIngestionAlert,
  TrendIngestionHealthService,
} from '@workers/services/trend-ingestion-health.service';

type Digest = {
  deduplicationKey: string;
  messages: {
    message: {
      payload: { card: { color: number; description: string; title: string } };
    };
  }[];
};

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
      upsert: vi.fn().mockImplementation(
        (input: {
          create: {
            deduplicationKey: string;
            occurredAt: Date;
            sourceId: string;
          };
        }) => {
          const { deduplicationKey, occurredAt, sourceId } = input.create;
          if (deduplicationKey.endsWith('enrollment-v1'))
            return Promise.resolve({ id: 'enrollment' });
          events.set(deduplicationKey, {
            deduplicationKey,
            occurredAt,
            sourceId,
          });
          return Promise.resolve({ id: deduplicationKey });
        },
      ),
      findFirstOrThrow: vi.fn().mockResolvedValue({ occurredAt: enrollment }),
      findMany: vi.fn().mockImplementation(
        (input: {
          where: {
            deduplicationKey: {
              endsWith?: string;
              in?: string[];
              not?: unknown;
            };
            sourceId?: { startsWith: string };
          };
        }) => {
          const wanted = input.where.deduplicationKey.in;
          if (wanted)
            return Promise.resolve(
              wanted.flatMap((key) => {
                const event = events.get(key);
                return event ? [event] : [];
              }),
            );
          const startsWith = input.where.sourceId?.startsWith ?? '';
          const wantsRecovered =
            input.where.deduplicationKey.endsWith !== undefined;
          return Promise.resolve(
            [...events.values()].filter(
              (event) =>
                event.sourceId.startsWith(startsWith) &&
                event.deduplicationKey.endsWith('/recovered') ===
                  wantsRecovered,
            ),
          );
        },
      ),
      findFirst: vi
        .fn()
        .mockImplementation(
          (input: {
            where: { deduplicationKey?: unknown; sourceId: string };
          }) => {
            const exact = input.where.deduplicationKey;
            if (typeof exact === 'string')
              return Promise.resolve(events.get(exact) ?? null);
            return Promise.resolve(
              [...events.values()]
                .filter(
                  (event) =>
                    event.sourceId === input.where.sourceId &&
                    !event.deduplicationKey.endsWith('/recovered'),
                )
                .sort(
                  (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
                )[0] ?? null,
            );
          },
        ),
    },
  };
  const health = { getHealth: vi.fn().mockResolvedValue([]) };
  const recorder = {
    afterCommit: vi.fn().mockResolvedValue(undefined),
    dispatchInTransaction: vi
      .fn()
      .mockResolvedValue({ pendingDeliveryIds: [] }),
  };
  const digests = (): Digest[] =>
    recorder.dispatchInTransaction.mock.calls.map(
      (args: unknown[]) => args[1] as Digest,
    );
  return {
    digests,
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
  it('retains the earliest incident baseline without spreading a large outage into function arguments', async () => {
    const { service } = setup();
    const missed = {
      baseline: new Date('2026-09-29T00:15:00.000Z'),
      isMissed: true,
      successAt: null,
    };
    const evaluated = Array.from({ length: 150_000 }, () => missed);
    evaluated[75_000] = { ...missed, baseline: enrollment };
    const alerts: PendingIngestionAlert[] = [];

    // biome-ignore lint/complexity/useLiteralKeys: Isolate the private incident phase without running the quadratic sweep.
    await service['reconcileIncident']({
      alerts,
      brief: 'Large provider outage',
      description: 'Large provider outage',
      evaluated,
      recoveredDescription: () => 'Recovered',
      sourceId: 'youtube/trends/scoped',
    });

    expect(alerts).toEqual([
      expect.objectContaining({
        isRecovery: false,
        key: `trend-ingestion-health/youtube/trends/scoped/missed/${enrollment.toISOString()}`,
        sourceId: 'youtube/trends/scoped',
      }),
    ]);
  });

  it('waits for two closed scheduled windows, emits actionable alerts once, and deduplicates continued failure', async () => {
    const { service, recorder, events, prisma, digests } = setup();
    await service.checkMissedWindows(new Date('2026-09-29T00:15:00.000Z'));
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
    await service.checkMissedWindows(new Date('2026-09-30T00:14:59.998Z'));
    expect(recorder.dispatchInTransaction).not.toHaveBeenCalled();
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    expect(events.size).toBe(15);
    expect(digests()).toHaveLength(1);
    const [card] = digests()[0].messages.map(
      (entry) => entry.message.payload.card,
    );
    expect(card.title).toBe('Trend ingestion: 15 missed two scheduled windows');
    expect(card.description).toContain('Inspect the trend maintenance queue');
    expect(card.description).not.toContain('more');
    const keys = [...events.keys()];
    await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
    expect([...events.keys()]).toEqual(keys);
    expect(digests()).toHaveLength(1);
  });

  it('checks every incident key in one query and gives the digest transaction room for a large outage', async () => {
    const { service, prisma } = setup();
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    const keyLookups = prisma.notificationEvent.findMany.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { where: { deduplicationKey: { in?: string[] } } }).where
          .deduplicationKey.in !== undefined,
    );
    expect(keyLookups).toHaveLength(1);
    expect(
      (keyLookups[0][0] as { where: { deduplicationKey: { in: string[] } } })
        .where.deduplicationKey.in,
    ).toHaveLength(15);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      timeout: 30_000,
    });
  });

  it('posts one message for every incident found in a run, and a continuing outage stays silent', async () => {
    const { service, digests, events, health, recorder } = setup();
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    expect(digests()).toHaveLength(1);
    expect(events.size).toBe(15);
    const recovered: TrendRefreshHealth[] = ['instagram', 'pinterest'].map(
      (platform) => ({
        completedAt: '2026-09-30T01:45:00.000Z',
        dataset: 'trends',
        lastAttemptAt: '2026-09-30T01:43:00.000Z',
        lastSuccessfulRefreshAt: '2026-09-30T01:45:00.000Z',
        outcome: 'native_available',
        platform,
        reason: null,
        scope: 'global',
      }),
    );
    health.getHealth.mockResolvedValue(recovered);
    await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
    expect(digests()).toHaveLength(2);
    const card = digests()[1].messages[0].message.payload.card;
    expect(card.title).toBe('Trend ingestion: 2 recovered');
    expect(card.color).toBe(0x22c55e);
    expect(card.description).toContain('instagram trends completed a refresh');
    expect(card.description).toContain('pinterest trends completed a refresh');
    expect(recorder.afterCommit).toHaveBeenCalledTimes(2);
  });

  it('leads a mixed digest with the counts and lists missed incidents before recoveries', () => {
    const { service } = setup();
    const alert = (
      isRecovery: boolean,
      label: string,
    ): PendingIngestionAlert => ({
      brief: label,
      description: `${label} (full)`,
      isRecovery,
      key: label,
      sourceId: label,
      title: label,
    });
    // biome-ignore lint/complexity/useLiteralKeys: Exercise the card layout without a full run.
    const card = service['buildDigestCard']([
      alert(true, 'instagram trends back'),
      alert(false, 'tiktok trends down'),
      alert(true, 'reddit trends back'),
    ]);
    expect(card.title).toBe('Trend ingestion: 1 need attention, 2 recovered');
    expect(card.color).toBe(0xef4444);
    expect(card.description.split('\n\n')[0]).toBe(
      '**Missed two scheduled windows (1)**\n• tiktok trends down',
    );
    expect(card.description).toContain(
      '**Recovered (2)**\n• instagram trends back\n• reddit trends back',
    );
  });

  it('keeps a single incident as the original card and caps a huge digest under the Discord limit', () => {
    const { service } = setup();
    const alert = (index: number): PendingIngestionAlert => ({
      brief: `dataset ${index}: ${'x'.repeat(200)}`,
      description: `dataset ${index} full text`,
      isRecovery: false,
      key: `key-${index}`,
      sourceId: `source-${index}`,
      title: 'Trend ingestion missed two scheduled windows',
    });
    // biome-ignore lint/complexity/useLiteralKeys: Exercise the card layout without a full run.
    const single = service['buildDigestCard']([alert(1)]);
    expect(single).toEqual({
      color: 0xef4444,
      description: 'dataset 1 full text',
      title: 'Trend ingestion missed two scheduled windows',
    });
    // biome-ignore lint/complexity/useLiteralKeys: Exercise the card layout without a full run.
    const huge = service['buildDigestCard'](
      Array.from({ length: 100 }, (_, index) => alert(index)),
    );
    expect(huge.description.length).toBeLessThan(4096);
    expect(huge.description).toMatch(/…and \d+ more/);
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
      await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
      const receipt: TrendRefreshHealth = {
        completedAt: '2026-09-30T01:45:00.000Z',
        dataset: 'trends',
        lastAttemptAt: '2026-09-30T01:43:00.000Z',
        lastSuccessfulRefreshAt: '2026-09-30T01:45:00.000Z',
        outcome,
        platform: 'youtube',
        reason: null,
        scope: 'global',
      };
      health.getHealth.mockResolvedValue([receipt]);
      await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
      expect(
        [...events.keys()].filter((key) => key.endsWith('/recovered')),
      ).toHaveLength(1);
      await service.checkMissedWindows(new Date('2026-10-02T00:15:00.000Z'));
      expect(
        [...events.keys()].filter((key) => key.endsWith('/recovered')),
      ).toHaveLength(1);
      await service.checkMissedWindows(new Date('2026-10-03T00:15:00.000Z'));
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
        completedAt: '2026-09-29T21:45:00.000Z',
        dataset: 'trends',
        lastAttemptAt: '2026-09-29T21:45:00.000Z',
        lastSuccessfulRefreshAt: '2026-09-29T21:45:00.000Z',
        outcome: 'fallback_available',
        platform: 'youtube',
        reason: 'native_failed',
        scope: 'global',
      },
    ]);
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    expect(
      [...events.keys()].some(
        (key) =>
          key.includes('youtube/trends/scope-') && key.includes('/missed/'),
      ),
    ).toBe(true);
    expect(
      JSON.stringify(recorder.dispatchInTransaction.mock.calls),
    ).not.toContain('private-org');
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
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    expect(
      [...events.keys()].some((key) =>
        key.startsWith('trend-ingestion-health/youtube/trends/missed/'),
      ),
    ).toBe(false);
    await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
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
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
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
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    const scoped = [...events.keys()].filter((key) =>
      key.startsWith('trend-ingestion-health/youtube/trends/scoped/missed/'),
    );
    expect(scoped).toHaveLength(1);
    const calls = JSON.stringify(recorder.dispatchInTransaction.mock.calls);
    expect(calls).toContain('30 of 30 connected tenant scopes');
    expect(calls).not.toContain('org-1');
    await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
    expect(
      [...events.keys()].filter((key) => key.includes('/scoped/missed/')),
    ).toEqual(scoped);
  });

  it('keeps one incident key while staggered scopes partially recover', async () => {
    const { service, health, prisma, events } = setup();
    const later = new Date('2026-09-29T00:15:00.000Z');
    prisma.credential.findMany.mockResolvedValue([
      { createdAt: enrollment, organizationId: 'org-a', platform: 'YOUTUBE' },
      { createdAt: later, organizationId: 'org-b', platform: 'YOUTUBE' },
    ]);
    health.getHealth.mockResolvedValue([]);
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    const scopedKeys = () =>
      [...events.keys()].filter((key) => key.includes('/scoped/missed/'));
    expect(scopedKeys()).toHaveLength(1);
    // org-a recovers; org-b is still missed, so the outage continues.
    health.getHealth.mockImplementation(
      (input: { organizationId?: string } = {}) =>
        Promise.resolve(
          input.organizationId === 'org-a'
            ? [
                {
                  completedAt: '2026-09-30T00:25:00.000Z',
                  dataset: 'trends',
                  lastAttemptAt: '2026-09-30T00:25:00.000Z',
                  lastSuccessfulRefreshAt: '2026-09-30T00:25:00.000Z',
                  outcome: 'native_available',
                  platform: 'youtube',
                  reason: null,
                  scope: 'scoped',
                },
              ]
            : [],
        ),
    );
    await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
    expect(scopedKeys()).toHaveLength(1);
  });

  it('closes the incident when every affected scope disconnects, so a later outage alerts again', async () => {
    const { service, health, prisma, events } = setup();
    const credential = {
      createdAt: enrollment,
      organizationId: 'org-a',
      platform: 'YOUTUBE',
    };
    prisma.credential.findMany.mockResolvedValue([credential]);
    health.getHealth.mockResolvedValue([]);
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    const outageKeys = () =>
      [...events.keys()].filter(
        (key) => key.includes('/scoped/missed/') && !key.endsWith('/recovered'),
      );
    expect(outageKeys()).toHaveLength(1);
    prisma.credential.findMany.mockResolvedValue([]);
    await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
    expect(
      [...events.keys()].filter((key) => key.endsWith('/recovered')),
    ).toHaveLength(1);
    prisma.credential.findMany.mockResolvedValue([
      { ...credential, createdAt: new Date('2026-10-01T01:45:00.000Z') },
    ]);
    await service.checkMissedWindows(new Date('2026-10-03T00:15:00.000Z'));
    await service.checkMissedWindows(new Date('2026-10-04T00:15:00.000Z'));
    expect(outageKeys()).toHaveLength(2);
  });

  it('gives a fresh incident key after recovery even when the credential createdAt is unchanged', async () => {
    const { service, health, prisma, events } = setup();
    const credential = {
      createdAt: enrollment,
      organizationId: 'org-a',
      platform: 'YOUTUBE',
    };
    prisma.credential.findMany.mockResolvedValue([credential]);
    health.getHealth.mockResolvedValue([]);
    await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
    prisma.credential.findMany.mockResolvedValue([]);
    await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
    prisma.credential.findMany.mockResolvedValue([credential]);
    await service.checkMissedWindows(new Date('2026-10-02T00:15:00.000Z'));
    expect(
      [...events.keys()].filter(
        (key) => key.includes('/scoped/missed/') && !key.endsWith('/recovered'),
      ),
    ).toHaveLength(2);
  });

  describe('while the global refresh is healthy', () => {
    const globalHealthy: TrendRefreshHealth = {
      completedAt: '2026-10-01T23:45:00.000Z',
      dataset: 'trends',
      lastAttemptAt: '2026-10-01T23:45:00.000Z',
      lastSuccessfulRefreshAt: '2026-10-01T23:45:00.000Z',
      outcome: 'native_available',
      platform: 'youtube',
      reason: null,
      scope: 'global',
    };
    const scopedHealthy: TrendRefreshHealth = {
      ...globalHealthy,
      scope: 'scoped',
    };
    const scopeKeys = (events: Map<string, unknown>) =>
      [...events.keys()].filter(
        (key) =>
          key.includes('youtube/trends/scope-') && !key.endsWith('/recovered'),
      );

    it('alerts for tenant B failing after tenant A, and recovers each scope on its own', async () => {
      const { service, health, prisma, events, recorder } = setup();
      const laterConnected = new Date('2026-09-29T00:15:00.000Z');
      prisma.credential.findMany.mockResolvedValue([
        { createdAt: enrollment, organizationId: 'org-a', platform: 'YOUTUBE' },
        {
          createdAt: laterConnected,
          organizationId: 'org-b',
          platform: 'YOUTUBE',
        },
      ]);
      health.getHealth.mockImplementation(
        (input: { organizationId?: string } = {}) =>
          Promise.resolve(input.organizationId ? [] : [globalHealthy]),
      );
      await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
      expect(scopeKeys(events)).toHaveLength(1);
      await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
      expect(scopeKeys(events)).toHaveLength(2);
      expect([...events.keys()].some((key) => key.includes('/scoped/'))).toBe(
        false,
      );
      expect(
        JSON.stringify(recorder.dispatchInTransaction.mock.calls),
      ).not.toContain('org-');
      // Tenant A recovers; only A's incident closes.
      health.getHealth.mockImplementation(
        (input: { organizationId?: string } = {}) =>
          Promise.resolve(
            input.organizationId === 'org-a'
              ? [scopedHealthy]
              : input.organizationId
                ? []
                : [globalHealthy],
          ),
      );
      await service.checkMissedWindows(new Date('2026-10-02T00:15:00.000Z'));
      expect(
        [...events.keys()].filter((key) => key.endsWith('/recovered')),
      ).toHaveLength(1);
      // Tenant B recovers too.
      health.getHealth.mockImplementation(
        (input: { organizationId?: string } = {}) =>
          Promise.resolve(
            input.organizationId ? [scopedHealthy] : [globalHealthy],
          ),
      );
      await service.checkMissedWindows(new Date('2026-10-03T00:15:00.000Z'));
      expect(
        [...events.keys()].filter((key) => key.endsWith('/recovered')),
      ).toHaveLength(2);
    });

    it.each([
      [
        'names the recorded failure reason',
        [
          {
            ...scopedHealthy,
            lastSuccessfulRefreshAt: null,
            outcome: 'native_failed',
            reason: 'authentication_required',
          },
        ],
        'Outcome: native_failed (authentication_required).',
      ],
      [
        'says when no scoped attempt was recorded',
        [],
        'No scoped refresh attempt is recorded for this scope',
      ],
    ] as const)(
      'the scope alert %s',
      async (_name, scopedReceipts, expected) => {
        const { service, health, prisma, digests } = setup();
        prisma.credential.findMany.mockResolvedValue([
          {
            createdAt: enrollment,
            organizationId: 'org-a',
            platform: 'YOUTUBE',
          },
        ]);
        health.getHealth.mockImplementation(
          (input: { organizationId?: string } = {}) =>
            Promise.resolve(
              input.organizationId ? [...scopedReceipts] : [globalHealthy],
            ),
        );
        await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
        const descriptions = digests()
          .flatMap((digest) => digest.messages)
          .map((entry) => entry.message.payload.card.description)
          .filter((text: string) => text.includes('tenant scope'));
        expect(descriptions).toHaveLength(1);
        expect(descriptions[0]).toContain(expected);
      },
    );

    it('ignores a global outage of an unrelated dataset', async () => {
      const { service, health, prisma, events } = setup();
      prisma.credential.findMany.mockResolvedValue([
        { createdAt: enrollment, organizationId: 'org-a', platform: 'YOUTUBE' },
        {
          createdAt: new Date('2026-09-29T00:15:00.000Z'),
          organizationId: 'org-b',
          platform: 'YOUTUBE',
        },
      ]);
      // Global youtube/videos has no receipt (outage); youtube/trends is healthy.
      health.getHealth.mockImplementation(
        (input: { organizationId?: string } = {}) =>
          Promise.resolve(input.organizationId ? [] : [globalHealthy]),
      );
      await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
      await service.checkMissedWindows(new Date('2026-10-01T00:15:00.000Z'));
      expect(
        [...events.keys()].some((key) =>
          key.startsWith('trend-ingestion-health/youtube/videos/missed/'),
        ),
      ).toBe(true);
      expect(scopeKeys(events)).toHaveLength(2);
      expect([...events.keys()].some((key) => key.includes('/scoped/'))).toBe(
        false,
      );
    });

    it('closes per-scope incidents when a global outage starts, and the aggregate when it ends', async () => {
      const { service, health, prisma, events } = setup();
      prisma.credential.findMany.mockResolvedValue([
        { createdAt: enrollment, organizationId: 'org-a', platform: 'YOUTUBE' },
      ]);
      health.getHealth.mockImplementation(
        (input: { organizationId?: string } = {}) =>
          Promise.resolve(input.organizationId ? [] : [globalHealthy]),
      );
      await service.checkMissedWindows(new Date('2026-09-30T00:15:00.000Z'));
      expect(scopeKeys(events)).toHaveLength(1);
      // Global goes stale: scope folds into the aggregate incident.
      health.getHealth.mockResolvedValue([]);
      await service.checkMissedWindows(new Date('2026-10-04T00:15:00.000Z'));
      const aggregate = () =>
        [...events.keys()].filter(
          (key) =>
            key.includes('/scoped/missed/') && !key.endsWith('/recovered'),
        );
      expect(aggregate()).toHaveLength(1);
      expect(
        [...events.keys()].filter(
          (key) => key.includes('/scope-') && key.endsWith('/recovered'),
        ),
      ).toHaveLength(1);
      // Global recovers while the scope still fails: aggregate closes.
      health.getHealth.mockImplementation(
        (input: { organizationId?: string } = {}) =>
          Promise.resolve(
            input.organizationId
              ? []
              : [
                  {
                    ...globalHealthy,
                    lastSuccessfulRefreshAt: '2026-10-04T23:45:00.000Z',
                  },
                ],
          ),
      );
      await service.checkMissedWindows(new Date('2026-10-05T00:15:00.000Z'));
      expect(
        [...events.keys()].filter(
          (key) => key.includes('/scoped/') && key.endsWith('/recovered'),
        ),
      ).toHaveLength(1);
    });
  });
});
