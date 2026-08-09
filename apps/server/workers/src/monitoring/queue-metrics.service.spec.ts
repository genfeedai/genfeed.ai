import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';

const mockCloudWatchSend = vi.fn();
const mockCloudWatchDestroy = vi.fn();
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockGetJobCounts = vi.fn();
const mockGetWaiting = vi.fn();

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
    constructor(private readonly name: string) {}

    close() {
      return mockQueueClose();
    }

    getJobCounts() {
      return mockGetJobCounts(this.name);
    }

    getWaiting() {
      return mockGetWaiting(this.name);
    }

    toKey(suffix: string) {
      return `bull:${this.name}:${suffix}`;
    }
  },
}));

describe('QueueMetricsService', () => {
  let service: QueueMetricsService;

  const mockRedisPublisher = {
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
    warn: vi.fn(),
  };
  const mockConfig = {
    get: vi.fn((key: string) =>
      key === 'AWS_REGION' ? 'us-west-1' : undefined,
    ),
    isProduction: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfig.isProduction = true;
    mockRedisService.getPublisher.mockReturnValue(mockRedisPublisher);
    mockGetJobCounts.mockResolvedValue({
      active: 1,
      delayed: 2,
      waiting: 3,
    });
    mockGetWaiting.mockResolvedValue([{ timestamp: Date.now() - 60_000 }]);
    mockRedisPublisher.set.mockResolvedValue('OK');
    mockRedisPublisher.xrange.mockResolvedValue([
      ['1-0', ['event', 'failed']],
      ['2-0', ['event', 'stalled']],
    ]);
    mockCloudWatchSend.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueMetricsService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedisService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<QueueMetricsService>(QueueMetricsService);
  });

  it('publishes aggregate metrics with only the fixed service dimension', async () => {
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

    expect(command.input.Namespace).toBe('Genfeed/Queues');
    expect(command.input.MetricData).toHaveLength(7);
    expect(command.input.MetricData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ MetricName: 'Heartbeat', Value: 1 }),
        expect.objectContaining({ MetricName: 'FailedJobs5m' }),
        expect.objectContaining({ MetricName: 'StalledJobs5m' }),
      ]),
    );
    expect(
      command.input.MetricData.every(
        (metric) =>
          metric.Dimensions.length === 1 &&
          metric.Dimensions[0]?.Name === 'Service' &&
          metric.Dimensions[0]?.Value === 'workers',
      ),
    ).toBe(true);
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

  it('publishes successful snapshots when one queue collection fails', async () => {
    mockGetJobCounts.mockImplementation(async (name: string) => {
      if (name === 'default') {
        throw new Error('queue unavailable');
      }
      return { active: 0, delayed: 0, waiting: 0 };
    });

    await service.publishQueueMetrics();

    expect(mockCloudWatchSend).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('1 queue failures'),
      expect.any(Object),
    );
  });

  it('closes queue wrappers and the CloudWatch client on shutdown', async () => {
    await service.publishQueueMetrics();
    await service.onModuleDestroy();

    expect(mockQueueClose).toHaveBeenCalled();
    expect(mockCloudWatchDestroy).toHaveBeenCalledTimes(1);
  });
});
