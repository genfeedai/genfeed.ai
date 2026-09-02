import { ALL_QUEUE_NAMES } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import type { QueueHealthNotification } from '@workers/monitoring/queue-health.types';
import { QueueHealthAlertNotifierService } from '@workers/monitoring/queue-health-alert-notifier.service';
import { QueueHealthMonitorService } from '@workers/monitoring/queue-health-monitor.service';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';

const mockCloudWatchSend = vi.fn();
const mockCloudWatchDestroy = vi.fn();
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockGetJobCounts = vi.fn();
const mockGetJobs = vi.fn();
const createdQueueNames: string[] = [];

vi.mock('@aws-sdk/client-cloudwatch', () => {
  class MockPutMetricDataCommand {
    constructor(public readonly input: unknown) {}
  }

  class MockCloudWatchClient {
    destroy() {
      mockCloudWatchDestroy();
    }

    send(...args: unknown[]) {
      return mockCloudWatchSend(...args);
    }
  }

  return {
    CloudWatchClient: MockCloudWatchClient,
    PutMetricDataCommand: MockPutMetricDataCommand,
  };
});

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    constructor(public readonly name: string) {
      createdQueueNames.push(name);
    }

    close() {
      return mockQueueClose();
    }

    getJobCounts() {
      return mockGetJobCounts(this.name);
    }

    getJobs() {
      return mockGetJobs(this.name);
    }

    toKey(suffix: string) {
      return `bull:${this.name}:${suffix}`;
    }
  },
}));

describe('QueueMetricsService', () => {
  let service: QueueMetricsService;

  const mockRedisPublisher = {
    del: vi.fn(),
    expire: vi.fn(),
    hdel: vi.fn(),
    hgetall: vi.fn(),
    hset: vi.fn(),
    set: vi.fn(),
    xrange: vi.fn(),
  };
  const mockRedisService = {
    getPublisher: vi.fn(
      (): typeof mockRedisPublisher | null => mockRedisPublisher,
    ),
  };
  const mockLogger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const mockAlertNotifier = {
    notify: vi.fn<(notification: QueueHealthNotification) => Promise<void>>(),
  };
  const mockConfig = {
    get: vi.fn((key: string) =>
      key === 'AWS_REGION' ? 'us-west-1' : undefined,
    ),
    isProduction: true,
    queueHealthAlertThrottleMs: 60 * 60 * 1000,
    queueHealthMaxFailed: 25,
    queueHealthMaxOldestWaitingAgeSeconds: 15 * 60,
    queueHealthMaxWaiting: 100,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    createdQueueNames.length = 0;
    mockConfig.isProduction = true;
    mockRedisService.getPublisher.mockReturnValue(mockRedisPublisher);
    mockGetJobCounts.mockResolvedValue({
      active: 1,
      delayed: 2,
      failed: 4,
      waiting: 3,
    });
    mockGetJobs.mockResolvedValue([{ timestamp: Date.now() - 60_000 }]);
    mockRedisPublisher.set.mockResolvedValue('OK');
    mockRedisPublisher.hgetall.mockResolvedValue({});
    mockRedisPublisher.hset.mockResolvedValue(1);
    mockRedisPublisher.hdel.mockResolvedValue(1);
    mockRedisPublisher.expire.mockResolvedValue(1);
    mockRedisPublisher.del.mockResolvedValue(1);
    mockRedisPublisher.xrange.mockResolvedValue([
      ['1-0', ['event', 'failed', 'jobId', 'job-failed-1']],
      ['2-0', ['event', 'stalled', 'jobId', 'job-stalled-1']],
    ]);
    mockCloudWatchSend.mockResolvedValue({});
    mockAlertNotifier.notify.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueMetricsService,
        QueueHealthMonitorService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedisService },
        { provide: LoggerService, useValue: mockLogger },
        {
          provide: QueueHealthAlertNotifierService,
          useValue: mockAlertNotifier,
        },
      ],
    }).compile();

    service = module.get<QueueMetricsService>(QueueMetricsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('automatically constructs a monitor for every canonical queue', async () => {
    await service.publishQueueMetrics();

    for (const queueName of ALL_QUEUE_NAMES) {
      expect(createdQueueNames).toContain(queueName);
      expect(mockRedisPublisher.set).toHaveBeenCalledWith(
        `genfeed:monitoring:queue-health:snapshot:${queueName}`,
        expect.any(String),
        'EX',
        15 * 60,
      );
    }
    expect(new Set(createdQueueNames).size).toBe(createdQueueNames.length);
  });

  it('persists counts and oldest-waiting age without job payloads', async () => {
    const now = Date.parse('2026-08-12T00:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockGetJobCounts.mockImplementation(async (name: string) =>
      name === 'workflow-execution'
        ? { active: 7, delayed: 6, failed: 5, waiting: 4 }
        : { active: 0, delayed: 0, failed: 0, waiting: 0 },
    );
    mockGetJobs.mockImplementation(async (name: string) =>
      name === 'workflow-execution'
        ? [{ data: { secret: 'must-not-leak' }, timestamp: now - 90_000 }]
        : [],
    );

    await service.publishQueueMetrics();

    const snapshotCall = mockRedisPublisher.set.mock.calls.find(
      ([key]) =>
        key === 'genfeed:monitoring:queue-health:snapshot:workflow-execution',
    );
    expect(snapshotCall).toBeDefined();
    const persisted = JSON.parse(String(snapshotCall?.[1]));
    expect(persisted).toEqual({
      active: 7,
      capturedAt: '2026-08-12T00:00:00.000Z',
      delayed: 6,
      failed: 5,
      oldestWaitingAgeSeconds: 90,
      queueName: 'workflow-execution',
      stalledEvents: 1,
      stalledJobIds: ['job-stalled-1'],
      waiting: 4,
    });
    expect(JSON.stringify(persisted)).not.toContain('must-not-leak');
  });

  it('alerts once with every breached threshold', async () => {
    const now = Date.parse('2026-08-12T00:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mockGetJobCounts.mockImplementation(async (name: string) =>
      name === 'workflow-execution'
        ? { active: 1, delayed: 2, failed: 26, waiting: 101 }
        : { active: 0, delayed: 0, failed: 0, waiting: 0 },
    );
    mockGetJobs.mockImplementation(async (name: string) =>
      name === 'workflow-execution' ? [{ timestamp: now - 901_000 }] : [],
    );

    await service.publishQueueMetrics();

    expect(mockAlertNotifier.notify).toHaveBeenCalledTimes(1);
    expect(mockAlertNotifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        breaches: expect.arrayContaining([
          { actual: 101, kind: 'waiting', threshold: 100 },
          {
            actual: 901,
            kind: 'oldest-waiting-age-seconds',
            threshold: 900,
          },
          { actual: 26, kind: 'failed', threshold: 25 },
        ]),
        kind: 'breach',
        snapshot: expect.objectContaining({ queueName: 'workflow-execution' }),
      }),
    );
  });

  it('throttles an already-alerted incident', async () => {
    const now = Date.now();
    mockGetJobCounts.mockImplementation(async (name: string) => ({
      active: 0,
      delayed: 0,
      failed: 0,
      waiting: name === 'workflow-execution' ? 101 : 0,
    }));
    mockRedisPublisher.hgetall.mockImplementation(async (key: string) =>
      key.endsWith(':workflow-execution')
        ? {
            alerted: '1',
            breachStartedAt: String(now - 10_000),
            lastAlertAt: String(now - 1_000),
            status: 'breached',
          }
        : {},
    );

    await service.publishQueueMetrics();

    expect(mockAlertNotifier.notify).not.toHaveBeenCalled();
  });

  it('deduplicates an alert when another worker owns its alert lock', async () => {
    mockGetJobCounts.mockImplementation(async (name: string) => ({
      active: 0,
      delayed: 0,
      failed: 0,
      waiting: name === 'workflow-execution' ? 101 : 0,
    }));
    mockRedisPublisher.set.mockImplementation(async (key: string) =>
      key.includes(':alert:breach:') ? null : 'OK',
    );

    await service.publishQueueMetrics();

    expect(mockAlertNotifier.notify).not.toHaveBeenCalled();
  });

  it('sends one recovery notice after a delivered incident clears', async () => {
    const incidentStartedAt = Date.now() - 120_000;
    mockGetJobCounts.mockResolvedValue({
      active: 0,
      delayed: 0,
      failed: 0,
      waiting: 0,
    });
    mockGetJobs.mockResolvedValue([]);
    mockRedisPublisher.hgetall.mockImplementation(async (key: string) =>
      key.endsWith(':workflow-execution')
        ? {
            alerted: '1',
            breachStartedAt: String(incidentStartedAt),
            lastAlertAt: String(incidentStartedAt),
            status: 'breached',
          }
        : {},
    );

    await service.publishQueueMetrics();

    expect(mockAlertNotifier.notify).toHaveBeenCalledTimes(1);
    expect(mockAlertNotifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        breaches: [],
        incidentStartedAt: new Date(incidentStartedAt).toISOString(),
        kind: 'recovery',
        snapshot: expect.objectContaining({ queueName: 'workflow-execution' }),
      }),
    );
  });

  it('continues metrics and other alerts when one alert transport fails', async () => {
    mockGetJobCounts.mockImplementation(async (name: string) => ({
      active: 0,
      delayed: 0,
      failed: 0,
      waiting:
        name === 'workflow-execution' || name === 'notification-delivery'
          ? 101
          : 0,
    }));
    mockAlertNotifier.notify.mockImplementation(async (notification) => {
      if (notification.snapshot.queueName === 'workflow-execution') {
        throw new Error('transport unavailable');
      }
    });

    await service.publishQueueMetrics();

    expect(mockAlertNotifier.notify).toHaveBeenCalledTimes(2);
    expect(mockCloudWatchSend).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('workflow-execution'),
      expect.any(Error),
      expect.any(Object),
    );
  });

  it('publishes successful snapshots when one queue collection fails', async () => {
    mockGetJobCounts.mockImplementation(async (name: string) => {
      if (name === 'workflow-execution') {
        throw new Error('queue unavailable');
      }
      return { active: 0, delayed: 0, failed: 0, waiting: 0 };
    });

    await service.publishQueueMetrics();

    expect(mockCloudWatchSend).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('1 queue failures'),
      expect.any(Object),
    );
  });

  it('keeps the existing five fixed-dimension CloudWatch metrics', async () => {
    await service.publishQueueMetrics();

    expect(mockCloudWatchSend).toHaveBeenCalledTimes(1);
    const command = mockCloudWatchSend.mock.calls[0]?.[0] as {
      input: {
        MetricData: Array<{
          Dimensions: Array<{ Name: string; Value: string }>;
          MetricName: string;
          Value: number;
        }>;
        Namespace: string;
      };
    };

    const aggregateMetrics = command.input.MetricData.filter(
      (metric) => metric.Dimensions.length === 1,
    );

    expect(command.input.Namespace).toBe('Genfeed/Queues');
    expect(aggregateMetrics).toHaveLength(5);
    expect(
      aggregateMetrics.every(
        (metric) =>
          metric.Dimensions[0]?.Name === 'Service' &&
          metric.Dimensions[0]?.Value === 'workers',
      ),
    ).toBe(true);
  });

  it('keeps an unconsumed queue out of the aggregate alarm metrics but names it per-queue', async () => {
    const now = Date.parse('2026-08-12T00:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    // `default` has producers and no @Processor, so its backlog only grows. Feeding
    // it into the aggregate MAX is what latched
    // `genfeed-production-queues-oldest-waiting` on 2026-08-10 with no way back to OK.
    mockGetJobCounts.mockImplementation(async (name: string) =>
      name === 'default'
        ? { active: 0, delayed: 0, failed: 0, waiting: 345 }
        : { active: 0, delayed: 0, failed: 0, waiting: 0 },
    );
    mockGetJobs.mockImplementation(async (name: string) =>
      name === 'default' ? [{ timestamp: now - 6_005_399_000 }] : [],
    );

    await service.publishQueueMetrics();

    expect(mockAlertNotifier.notify).not.toHaveBeenCalled();

    const command = mockCloudWatchSend.mock.calls[0]?.[0] as {
      input: {
        MetricData: Array<{
          Dimensions: Array<{ Name: string; Value: string }>;
          MetricName: string;
          Value: number;
        }>;
      };
    };
    const aggregateOldest = command.input.MetricData.find(
      (metric) =>
        metric.MetricName === 'OldestWaitingAgeSeconds' &&
        !metric.Dimensions.some((dimension) => dimension.Name === 'Queue'),
    );
    expect(aggregateOldest?.Value).toBe(0);

    // The gap still has to be visible, just not as an unrecoverable alarm.
    const perQueue = command.input.MetricData.filter((metric) =>
      metric.Dimensions.some(
        (dimension) =>
          dimension.Name === 'Queue' && dimension.Value === 'default',
      ),
    );
    expect(
      perQueue.find((metric) => metric.MetricName === 'WaitingJobs')?.Value,
    ).toBe(345);
    expect(
      perQueue.find((metric) => metric.MetricName === 'OldestWaitingAgeSeconds')
        ?.Value,
    ).toBe(6_005_399);
  });

  it('logs and publishes per-queue stall telemetry without job payloads', async () => {
    mockGetJobs.mockImplementation(async (name: string) =>
      name === 'workflow-execution'
        ? [{ data: { secret: 'must-not-leak' }, timestamp: Date.now() }]
        : [],
    );

    await service.publishQueueMetrics();

    const command = mockCloudWatchSend.mock.calls[0]?.[0] as {
      input: {
        MetricData: Array<{
          Dimensions: Array<{ Name: string; Value: string }>;
          MetricName: string;
          Value: number;
        }>;
      };
    };
    const perQueueStalls = command.input.MetricData.filter(
      (metric) =>
        metric.MetricName === 'StalledJobs5m' &&
        metric.Dimensions.some((dimension) => dimension.Name === 'Queue'),
    );

    expect(perQueueStalls.length).toBeGreaterThan(0);
    expect(
      perQueueStalls.every(
        (metric) =>
          metric.Dimensions.some(
            (dimension) =>
              dimension.Name === 'Service' && dimension.Value === 'workers',
          ) &&
          metric.Dimensions.some((dimension) => dimension.Name === 'Queue'),
      ),
    ).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'BullMQ job stalled',
      expect.objectContaining({
        jobId: 'job-stalled-1',
        queueName: 'workflow-execution',
      }),
    );
    const stallContexts = mockLogger.warn.mock.calls
      .filter((call) => call[0] === 'BullMQ job stalled')
      .map((call) => call[1]);
    expect(stallContexts.length).toBeGreaterThan(0);
    expect(
      stallContexts.every(
        (context) =>
          context !== null &&
          typeof context === 'object' &&
          !Object.hasOwn(context, 'worker'),
      ),
    ).toBe(true);
    expect(
      mockLogger.warn.mock.calls.some((call) =>
        JSON.stringify(call).includes('must-not-leak'),
      ),
    ).toBe(false);
  });

  it('does not publish outside production', async () => {
    mockConfig.isProduction = false;

    await service.publishQueueMetrics();

    expect(mockCloudWatchSend).not.toHaveBeenCalled();
  });

  it('does not publish when Redis is unavailable', async () => {
    mockRedisService.getPublisher.mockReturnValueOnce(null);

    await service.publishQueueMetrics();

    expect(mockCloudWatchSend).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis is unavailable'),
      expect.any(Object),
    );
  });

  it('publishes only once per collection window across worker replicas', async () => {
    mockRedisPublisher.set.mockResolvedValueOnce(null);

    await service.publishQueueMetrics();

    expect(mockCloudWatchSend).not.toHaveBeenCalled();
  });

  it('closes queue wrappers and the CloudWatch client on shutdown', async () => {
    await service.publishQueueMetrics();
    await service.onModuleDestroy();

    expect(mockQueueClose).toHaveBeenCalled();
    expect(mockCloudWatchDestroy).toHaveBeenCalledTimes(1);
  });
});
