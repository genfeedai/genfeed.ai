import { CONSUMED_QUEUE_NAMES } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import type {
  OperationalQueueHealthSnapshot,
  QueueHealthNotification,
} from '@workers/monitoring/queue-health.types';
import { QueueHealthAlertNotifierService } from '@workers/monitoring/queue-health-alert-notifier.service';
import { QueueHealthMonitorService } from '@workers/monitoring/queue-health-monitor.service';
import type Redis from 'ioredis';

const NOW = Date.parse('2026-10-25T09:25:00.000Z');
const INCIDENT_PREFIX = 'genfeed:monitoring:queue-health:incident';
const SNAPSHOT_PREFIX = 'genfeed:monitoring:queue-health:snapshot';
const THROTTLE_MS = 60 * 60 * 1000;

function snapshot(
  queueName: string,
  overrides: Partial<OperationalQueueHealthSnapshot> = {},
): OperationalQueueHealthSnapshot {
  return {
    active: 1,
    capturedAt: new Date(NOW).toISOString(),
    delayed: 2,
    failed: 0,
    oldestWaitingAgeSeconds: 0,
    queueName,
    stalledEvents: 0,
    stalledJobIds: [],
    waiting: 0,
    ...overrides,
  };
}

describe('QueueHealthMonitorService', () => {
  const logger = { error: vi.fn() };
  const notifier = {
    notify: vi.fn<(notification: QueueHealthNotification) => Promise<void>>(),
  };
  const redis = {
    del: vi.fn(),
    eval: vi.fn<
      (script: string, keyCount: number, ...keys: string[]) => Promise<unknown>
    >(),
    expire: vi.fn(),
    hdel: vi.fn(),
    hgetall: vi.fn(),
    hset: vi.fn(),
    set: vi.fn(),
  };
  const states = new Map<string, unknown>();
  let service: QueueHealthMonitorService;
  let client: Redis;

  beforeEach(async () => {
    vi.resetAllMocks();
    states.clear();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    redis.eval.mockImplementation(async (_script, _count, ...keys) =>
      keys.map((key) => [
        key,
        states.has(key) ? states.get(key) : [null, null, null, null],
      ]),
    );
    redis.hgetall.mockResolvedValue({});
    for (const method of [redis.hset, redis.hdel, redis.expire, redis.del])
      method.mockResolvedValue(1);
    redis.set.mockResolvedValue('OK');
    notifier.notify.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        QueueHealthMonitorService,
        {
          provide: ConfigService,
          useValue: {
            queueHealthAlertThrottleMs: THROTTLE_MS,
            queueHealthMaxFailed: 25,
            queueHealthMaxOldestWaitingAgeSeconds: 900,
            queueHealthMaxWaiting: 100,
          },
        },
        { provide: LoggerService, useValue: logger },
        { provide: QueueHealthAlertNotifierService, useValue: notifier },
        { provide: 'TEST_REDIS', useValue: redis },
      ],
    }).compile();
    service = module.get(QueueHealthMonitorService);
    client = module.get<Redis>('TEST_REDIS');
  });
  afterEach(() => vi.restoreAllMocks());

  it('reads every consumed queue in one bounded client command and preserves snapshots', async () => {
    const snapshots = [...CONSUMED_QUEUE_NAMES]
      .reverse()
      .map((name) => snapshot(name));
    await service.processSnapshots(snapshots, client);
    expect(redis.eval).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      CONSUMED_QUEUE_NAMES.length,
      ...snapshots.map((value) => `${INCIDENT_PREFIX}:${value.queueName}`),
    );
    expect(redis.hgetall).not.toHaveBeenCalled();
    for (const value of snapshots) {
      expect(redis.set).toHaveBeenCalledWith(
        `${SNAPSHOT_PREFIX}:${value.queueName}`,
        JSON.stringify(value),
        'EX',
        900,
      );
      expect(redis.hset).toHaveBeenCalledWith(
        `${INCIDENT_PREFIX}:${value.queueName}`,
        'status',
        'healthy',
      );
    }
  });

  it('correlates states with queue keys while preserving throttling and recovery', async () => {
    states.set(`${INCIDENT_PREFIX}:workflow-execution`, [
      '1',
      String(NOW - 10000),
      String(NOW - 1000),
      'breached',
    ]);
    states.set(`${INCIDENT_PREFIX}:notification-delivery`, [
      '1',
      String(NOW - 120000),
      String(NOW - 120000),
      'breached',
    ]);
    await service.processSnapshots(
      [
        snapshot('workflow-execution', { waiting: 101 }),
        snapshot('notification-delivery'),
      ],
      client,
    );
    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: 'recovery',
        incidentStartedAt: new Date(NOW - 120000).toISOString(),
        snapshot: expect.objectContaining({
          queueName: 'notification-delivery',
        }),
      }),
    );
    expect(redis.hdel).toHaveBeenCalledWith(
      `${INCIDENT_PREFIX}:notification-delivery`,
      'alerted',
      'breachStartedAt',
      'lastAlertAt',
    );
    expect(redis.expire).toHaveBeenCalledWith(
      `${INCIDENT_PREFIX}:workflow-execution`,
      7 * 24 * 60 * 60,
    );
  });

  it('persists excluded queues without reading incident state', async () => {
    await service.processSnapshots(
      [
        snapshot('default', { waiting: 101 }),
        snapshot('youtube-processing', { waiting: 101 }),
      ],
      client,
    );
    expect(redis.eval).not.toHaveBeenCalled();
    expect(redis.hgetall).not.toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('bounds mixed batches to unique consumed canonical keys', async () => {
    await service.processSnapshots(
      [
        snapshot('workflow-execution'),
        snapshot('default'),
        snapshot('youtube-processing'),
        snapshot('workflow-execution'),
      ],
      client,
    );
    expect(redis.eval).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      1,
      `${INCIDENT_PREFIX}:workflow-execution`,
    );
    expect(redis.set).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['per-key Redis error', null],
    ['missing fields', [null, null]],
    ['non-string field', [1, null, null, 'breached']],
    ['invalid status', [null, null, null, 'unknown']],
    ['invalid timestamp', ['1', 'invalid', null, 'breached']],
  ])('isolates %s without creating false incidents', async (_reason, value) => {
    states.set(`${INCIDENT_PREFIX}:workflow-execution`, value);
    await service.processSnapshots(
      [
        snapshot('workflow-execution', { waiting: 101 }),
        snapshot('notification-delivery', { waiting: 101 }),
      ],
      client,
    );
    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: 'breach',
        snapshot: expect.objectContaining({
          queueName: 'notification-delivery',
        }),
      }),
    );
    expect(
      redis.hset.mock.calls.every(
        ([key]) => key !== `${INCIDENT_PREFIX}:workflow-execution`,
      ),
    ).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      `${SNAPSHOT_PREFIX}:workflow-execution`,
      expect.any(String),
      'EX',
      900,
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('workflow-execution'),
      expect.any(Error),
      expect.any(Object),
    );
  });

  it('rejects mismatched keys without shifting another queue state', async () => {
    redis.eval.mockResolvedValue([
      [`${INCIDENT_PREFIX}:notification-delivery`, [null, null, null, null]],
      [`${INCIDENT_PREFIX}:notification-delivery`, [null, null, null, null]],
    ]);
    await service.processSnapshots(
      [
        snapshot('workflow-execution', { waiting: 101 }),
        snapshot('notification-delivery', { waiting: 101 }),
      ],
      client,
    );
    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          queueName: 'notification-delivery',
        }),
      }),
    );
  });

  it('keeps snapshots when the batch read fails and never defaults unavailable incident state to empty', async () => {
    redis.eval.mockRejectedValue(new Error('Redis unavailable'));
    await service.processSnapshots(
      [
        snapshot('workflow-execution', { waiting: 101 }),
        snapshot('notification-delivery'),
      ],
      client,
    );
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.hset).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it.each([
    { label: 'null', response: null },
    { label: 'empty array', response: [] },
    { label: 'string', response: 'invalid' },
    {
      label: 'extra entry',
      response: [
        ['unexpected', []],
        ['extra', []],
      ],
    },
  ])(
    'fails closed on a malformed batch envelope: $label',
    async ({ response }) => {
      redis.eval.mockResolvedValue(response);
      await service.processSnapshots(
        [snapshot('workflow-execution', { waiting: 101 })],
        client,
      );
      expect(redis.set).toHaveBeenCalledTimes(1);
      expect(redis.hset).not.toHaveBeenCalled();
      expect(notifier.notify).not.toHaveBeenCalled();
    },
  );

  it('preserves threshold details, incident TTL and breach lock expiry', async () => {
    await service.processSnapshots(
      [
        snapshot('workflow-execution', {
          failed: 26,
          oldestWaitingAgeSeconds: 901,
          waiting: 101,
        }),
      ],
      client,
    );
    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: 'breach',
        breaches: [
          { actual: 101, kind: 'waiting', threshold: 100 },
          { actual: 901, kind: 'oldest-waiting-age-seconds', threshold: 900 },
          { actual: 26, kind: 'failed', threshold: 25 },
        ],
      }),
    );
    expect(redis.hset).toHaveBeenCalledWith(
      `${INCIDENT_PREFIX}:workflow-execution`,
      'status',
      'breached',
      'breachStartedAt',
      String(NOW),
      'alerted',
      '0',
    );
    expect(redis.hset).toHaveBeenCalledWith(
      `${INCIDENT_PREFIX}:workflow-execution`,
      'alerted',
      '1',
      'lastAlertAt',
      String(NOW),
    );
    expect(redis.set).toHaveBeenCalledWith(
      `genfeed:monitoring:queue-health:alert:breach:workflow-execution:${NOW}`,
      '1',
      'PX',
      THROTTLE_MS,
      'NX',
    );
    expect(redis.expire).toHaveBeenCalledWith(
      `${INCIDENT_PREFIX}:workflow-execution`,
      7 * 24 * 60 * 60,
    );
  });

  it('respects an alert lock already held by another worker', async () => {
    redis.set.mockImplementation(async (key: string) =>
      key.includes(':alert:') ? null : 'OK',
    );
    await service.processSnapshots(
      [snapshot('workflow-execution', { waiting: 101 })],
      client,
    );
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('continues other queues when one snapshot write fails', async () => {
    redis.set.mockImplementation(async (key: string) => {
      if (key === `${SNAPSHOT_PREFIX}:workflow-execution`)
        throw new Error('snapshot unavailable');
      return 'OK';
    });
    await service.processSnapshots(
      [
        snapshot('workflow-execution', { waiting: 101 }),
        snapshot('notification-delivery', { waiting: 101 }),
      ],
      client,
    );
    expect(notifier.notify).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          queueName: 'notification-delivery',
        }),
      }),
    );
  });

  it('releases a failed notification lock while other queues progress', async () => {
    notifier.notify.mockImplementation(async (notification) => {
      if (notification.snapshot.queueName === 'workflow-execution')
        throw new Error('transport unavailable');
    });
    await service.processSnapshots(
      [
        snapshot('workflow-execution', { waiting: 101 }),
        snapshot('notification-delivery', { waiting: 101 }),
      ],
      client,
    );
    expect(notifier.notify).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledExactlyOnceWith(
      `genfeed:monitoring:queue-health:alert:breach:workflow-execution:${NOW}`,
    );
  });

  it('retains a delivered alert lock when incident persistence fails', async () => {
    redis.hset.mockImplementation(async (_key: string, field: string) => {
      if (field === 'alerted') throw new Error('state write unavailable');
      return 1;
    });
    await service.processSnapshots(
      [snapshot('workflow-execution', { waiting: 101 })],
      client,
    );
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(redis.del).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
