import { type BaseJob, BaseJobService } from '@libs/jobs/base-job.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { Injectable, Optional } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('test-caller') },
}));

/** Minimal concrete subtype for testing. */
interface TestJob extends BaseJob {
  resultUrl?: string;
}

/** Concrete injectable subclass for DI in tests. */
@Injectable()
class TestJobService extends BaseJobService<TestJob> {
  constructor(
    loggerService: LoggerService,
    @Optional() redisService?: RedisService,
  ) {
    super(loggerService, 'test', redisService);
  }
}

type MockLogger = {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

function createMockLogger(): MockLogger {
  return { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
}

/** In-memory fake of the ioredis publisher surface used by the service. */
function createMockPublisher() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    scan: vi.fn(
      async (
        _cursor: string,
        _match: string,
        pattern: string,
        _count: string,
        _countValue: number,
      ) => {
        const prefix = pattern.slice(0, -1);
        const foundKeys = Array.from(store.keys()).filter((key) =>
          key.startsWith(prefix),
        );
        return ['0', foundKeys] as [string, string[]];
      },
    ),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
    }),
    store,
    unlink: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

type MockPublisher = ReturnType<typeof createMockPublisher>;

function createMockRedisService(publisher: MockPublisher | null): RedisService {
  return {
    getPublisher: vi.fn(() => publisher),
  } as unknown as RedisService;
}

describe('BaseJobService', () => {
  let service: TestJobService;
  let logger: MockLogger;

  beforeEach(async () => {
    vi.clearAllMocks();
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TestJobService, { provide: LoggerService, useValue: logger }],
    }).compile();

    service = module.get(TestJobService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createJob', () => {
    it('creates a job with queued status', async () => {
      const job = await service.createJob({
        params: { prompt: 'test' },
        type: 'gen',
      });
      expect(job.status).toBe('queued');
    });

    it('assigns a UUID to new jobs', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      expect(job.jobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('assigns unique IDs across multiple jobs', async () => {
      const j1 = await service.createJob({ params: {}, type: 'gen' });
      const j2 = await service.createJob({ params: {}, type: 'gen' });
      expect(j1.jobId).not.toBe(j2.jobId);
    });

    it('stores provided params in the job', async () => {
      const params = { model: 'sdxl', steps: 30 };
      const job = await service.createJob({ params, type: 'gen' });
      expect(job.params).toEqual(params);
    });

    it('sets createdAt as a valid ISO timestamp', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      expect(() => new Date(job.createdAt)).not.toThrow();
      expect(new Date(job.createdAt).toISOString()).toBe(job.createdAt);
    });

    it('logs job creation', async () => {
      await service.createJob({ params: {}, type: 'gen' });
      expect(logger.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 'Job created' }),
      );
    });
  });

  describe('getJob', () => {
    it('retrieves a job by its id', async () => {
      const created = await service.createJob({ params: {}, type: 'gen' });
      const retrieved = await service.getJob(created.jobId);
      expect(retrieved).toEqual(created);
    });

    it('returns null for unknown job id', async () => {
      const result = await service.getJob('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('updateJob', () => {
    it('updates a job status to processing', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      const updated = await service.updateJob(job.jobId, {
        status: 'processing',
      });
      expect(updated?.status).toBe('processing');
    });

    it('returns null when updating a non-existent job', async () => {
      const result = await service.updateJob('missing-id', {
        status: 'completed',
      });
      expect(result).toBeNull();
    });

    it('merges partial updates without replacing unchanged fields', async () => {
      const params = { model: 'flux' };
      const job = await service.createJob({ params, type: 'gen' });
      const updated = await service.updateJob(job.jobId, {
        status: 'completed',
      });
      expect(updated?.params).toEqual(params);
      expect(updated?.type).toBe('gen');
    });

    it('allows setting domain-specific optional fields', async () => {
      const job = await service.createJob({ params: {}, type: 'gen' });
      const updated = await service.updateJob(job.jobId, {
        resultUrl: 'https://cdn.example.com/result.jpg',
        status: 'completed',
      });
      expect(updated?.resultUrl).toBe('https://cdn.example.com/result.jpg');
    });
  });

  describe('getStats', () => {
    it('returns zero counts when no jobs exist', async () => {
      const stats = await service.getStats();
      expect(stats).toEqual({
        active: 0,
        completed: 0,
        failed: 0,
        queued: 0,
        total: 0,
      });
    });

    it('counts queued jobs correctly', async () => {
      await service.createJob({ params: {}, type: 'gen' });
      await service.createJob({ params: {}, type: 'gen' });
      const stats = await service.getStats();
      expect(stats.queued).toBe(2);
      expect(stats.total).toBe(2);
    });

    it('counts jobs across all statuses', async () => {
      const j1 = await service.createJob({ params: {}, type: 'gen' });
      const j2 = await service.createJob({ params: {}, type: 'gen' });
      const j3 = await service.createJob({ params: {}, type: 'gen' });
      const j4 = await service.createJob({ params: {}, type: 'gen' });
      await service.updateJob(j1.jobId, { status: 'processing' });
      await service.updateJob(j2.jobId, { status: 'completed' });
      await service.updateJob(j3.jobId, { status: 'failed' });
      const stats = await service.getStats();
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.queued).toBe(1);
      expect(stats.total).toBe(4);
      expect(j4.status).toBe('queued');
    });
  });

  describe('Redis persistence', () => {
    let publisher: MockPublisher;
    let redisService: RedisService;
    let redisBackedService: TestJobService;

    beforeEach(() => {
      publisher = createMockPublisher();
      redisService = createMockRedisService(publisher);
      redisBackedService = new TestJobService(
        logger as unknown as LoggerService,
        redisService,
      );
    });

    it('persists created jobs to Redis under the namespaced key', async () => {
      const job = await redisBackedService.createJob({
        params: { prompt: 'persist me' },
        type: 'gen',
      });

      expect(publisher.setex).toHaveBeenCalledWith(
        `jobs:test:${job.jobId}`,
        86400,
        JSON.stringify(job),
      );
    });

    it('persists job updates to Redis', async () => {
      const job = await redisBackedService.createJob({
        params: {},
        type: 'gen',
      });
      const updated = await redisBackedService.updateJob(job.jobId, {
        status: 'completed',
      });

      expect(publisher.store.get(`jobs:test:${job.jobId}`)).toBe(
        JSON.stringify(updated),
      );
    });

    it('reads a job from Redis when not in the in-memory cache', async () => {
      const job = await redisBackedService.createJob({
        params: { prompt: 'survive' },
        type: 'gen',
      });

      // Simulate a service restart: fresh instance, same Redis store.
      const restarted = new TestJobService(
        logger as unknown as LoggerService,
        redisService,
      );
      const recovered = await restarted.getJob(job.jobId);

      expect(recovered).toEqual(job);
    });

    it('updates a job recovered from Redis after a restart', async () => {
      const job = await redisBackedService.createJob({
        params: {},
        type: 'gen',
      });

      const restarted = new TestJobService(
        logger as unknown as LoggerService,
        redisService,
      );
      const updated = await restarted.updateJob(job.jobId, {
        resultUrl: 'https://cdn.example.com/after-restart.jpg',
        status: 'completed',
      });

      expect(updated?.status).toBe('completed');
      expect(updated?.resultUrl).toBe(
        'https://cdn.example.com/after-restart.jpg',
      );
    });

    it('computes stats from Redis after a restart', async () => {
      const j1 = await redisBackedService.createJob({
        params: {},
        type: 'gen',
      });
      await redisBackedService.createJob({ params: {}, type: 'gen' });
      await redisBackedService.updateJob(j1.jobId, { status: 'completed' });

      const restarted = new TestJobService(
        logger as unknown as LoggerService,
        redisService,
      );
      const stats = await restarted.getStats();

      expect(stats.completed).toBe(1);
      expect(stats.queued).toBe(1);
      expect(stats.total).toBe(2);
    });

    it('falls back to memory and warns when Redis writes fail', async () => {
      publisher.setex.mockRejectedValueOnce(new Error('redis down'));

      const job = await redisBackedService.createJob({
        params: {},
        type: 'gen',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 'Failed to persist job to Redis' }),
      );
      expect(await redisBackedService.getJob(job.jobId)).toEqual(job);
    });

    it('falls back to memory stats when the publisher is unavailable', async () => {
      const offlineService = new TestJobService(
        logger as unknown as LoggerService,
        createMockRedisService(null),
      );
      await offlineService.createJob({ params: {}, type: 'gen' });

      const stats = await offlineService.getStats();

      expect(stats.queued).toBe(1);
      expect(stats.total).toBe(1);
    });

    it('returns null from getJob when Redis reads fail', async () => {
      publisher.get.mockRejectedValueOnce(new Error('read error'));

      const result = await redisBackedService.getJob('unknown-id');

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 'Failed to read job from Redis' }),
      );
    });

    it('keeps the 24h TTL when persisting job updates', async () => {
      const job = await redisBackedService.createJob({
        params: {},
        type: 'gen',
      });
      const updated = await redisBackedService.updateJob(job.jobId, {
        status: 'completed',
      });

      expect(publisher.setex).toHaveBeenLastCalledWith(
        `jobs:test:${job.jobId}`,
        86400,
        JSON.stringify(updated),
      );
    });

    it('skips corrupt job entries and keeps valid ones in stats', async () => {
      await redisBackedService.createJob({ params: {}, type: 'gen' });
      publisher.store.set('jobs:test:corrupt', 'not-json{');

      const stats = await redisBackedService.getStats();

      expect(stats.queued).toBe(1);
      expect(stats.total).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          key: 'jobs:test:corrupt',
          message: 'Skipping corrupt job entry in Redis',
        }),
      );
    });

    it('falls back to memory stats and warns when the Redis scan fails', async () => {
      await redisBackedService.createJob({ params: {}, type: 'gen' });
      publisher.scan.mockRejectedValueOnce(new Error('scan failed'));

      const stats = await redisBackedService.getStats();

      expect(stats.queued).toBe(1);
      expect(stats.total).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 'Failed to read jobs from Redis' }),
      );
    });
  });
});
