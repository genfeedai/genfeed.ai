import { JobLifecyclePublisherService } from '@files/services/job-lifecycle-publisher.service';
import { RedisService } from '@libs/redis/redis.service';

const mockQueueEventsInstances: Array<{
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('bullmq', () => {
  class MockQueue {
    public name: string;
    public opts: { connection: { host: string; port: number } };

    constructor(
      name: string,
      opts?: { connection?: { host: string; port: number } },
    ) {
      this.name = name;
      this.opts = {
        connection: opts?.connection ?? { host: 'localhost', port: 6379 },
      };
    }
  }

  class MockQueueEvents {
    public on = vi.fn();
    public close = vi.fn().mockResolvedValue(undefined);

    constructor(_name: string, _opts: unknown) {
      mockQueueEventsInstances.push({ close: this.close, on: this.on });
    }
  }

  return {
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
  };
});

describe('JobLifecyclePublisherService', () => {
  let service: JobLifecyclePublisherService;
  let mockRedisService: Pick<RedisService, 'publish'>;

  const mockConnection = {
    host: 'localhost',
    port: 6379,
  };

  const createMockQueue = (name: string) => ({
    name,
    opts: { connection: mockConnection },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueEventsInstances.length = 0;

    mockRedisService = {
      publish: vi.fn().mockResolvedValue(1),
    };

    service = new JobLifecyclePublisherService(
      mockRedisService as RedisService,
      createMockQueue('task-processing') as never,
      createMockQueue('video-processing') as never,
      createMockQueue('image-processing') as never,
      createMockQueue('file-processing') as never,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should setup QueueEvents listeners on module init', () => {
    service.onModuleInit();

    expect(mockQueueEventsInstances).toHaveLength(4);
    for (const queueEvents of mockQueueEventsInstances) {
      expect(queueEvents.on).toHaveBeenCalledTimes(7);
      expect(queueEvents.on).toHaveBeenCalledWith(
        'waiting',
        expect.any(Function),
      );
      expect(queueEvents.on).toHaveBeenCalledWith(
        'active',
        expect.any(Function),
      );
      expect(queueEvents.on).toHaveBeenCalledWith(
        'completed',
        expect.any(Function),
      );
      expect(queueEvents.on).toHaveBeenCalledWith(
        'failed',
        expect.any(Function),
      );
      expect(queueEvents.on).toHaveBeenCalledWith(
        'progress',
        expect.any(Function),
      );
      expect(queueEvents.on).toHaveBeenCalledWith(
        'stalled',
        expect.any(Function),
      );
      expect(queueEvents.on).toHaveBeenCalledWith(
        'removed',
        expect.any(Function),
      );
    }
  });

  it('should publish serialized job status to Redis', async () => {
    await service.publishJobEvent('task', 'job-123', 'completed', {
      assetId: 'asset-789',
      userId: 'user-456',
    });

    expect(mockRedisService.publish).toHaveBeenCalledWith(
      'job-lifecycle:task',
      expect.stringContaining('"jobId":"job-123"'),
    );
  });

  it('should close queue event listeners on module destroy', async () => {
    service.onModuleInit();

    await service.onModuleDestroy();

    for (const queueEvents of mockQueueEventsInstances) {
      expect(queueEvents.close).toHaveBeenCalledTimes(1);
    }
  });
});
