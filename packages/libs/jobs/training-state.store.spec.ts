import {
  type TrainingProcessRecord,
  TrainingStateStore,
} from '@libs/jobs/training-state.store';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('test-caller') },
}));

interface TestTrainingJob {
  jobId: string;
  status: string;
}

type MockLogger = {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

function createMockLogger(): MockLogger {
  return { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
}

/** In-memory fake of the ioredis publisher surface used by the store. */
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

describe('TrainingStateStore', () => {
  let logger: MockLogger;
  let publisher: MockPublisher;
  let store: TrainingStateStore<TestTrainingJob>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    publisher = createMockPublisher();
    store = new TrainingStateStore<TestTrainingJob>(
      'voices',
      logger as unknown as LoggerService,
      createMockRedisService(publisher),
    );
  });

  describe('persistJob', () => {
    it('writes the job under the namespaced job key with a TTL', async () => {
      const job: TestTrainingJob = { jobId: 'job-1', status: 'running' };

      await store.persistJob(job);

      expect(publisher.setex).toHaveBeenCalledWith(
        'training:voices:job:job-1',
        86400,
        JSON.stringify(job),
      );
    });

    it('is a no-op when Redis is unavailable', async () => {
      const offlineStore = new TrainingStateStore<TestTrainingJob>(
        'voices',
        logger as unknown as LoggerService,
        createMockRedisService(null),
      );

      await expect(
        offlineStore.persistJob({ jobId: 'job-1', status: 'running' }),
      ).resolves.toBeUndefined();
    });

    it('warns instead of throwing when the write fails', async () => {
      publisher.setex.mockRejectedValueOnce(new Error('redis down'));

      await store.persistJob({ jobId: 'job-1', status: 'running' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Failed to persist training state to Redis',
        }),
      );
    });
  });

  describe('persistProcessRecord', () => {
    it('writes the process record under the namespaced process key', async () => {
      const record: TrainingProcessRecord = {
        jobId: 'job-1',
        pid: 12345,
        startedAt: '2026-06-11T00:00:00.000Z',
      };

      await store.persistProcessRecord(record);

      expect(publisher.setex).toHaveBeenCalledWith(
        'training:voices:process:job-1',
        86400,
        JSON.stringify(record),
      );
    });
  });

  describe('deleteProcessRecord', () => {
    it('removes the process record key', async () => {
      await store.persistProcessRecord({
        jobId: 'job-1',
        pid: 12345,
        startedAt: '2026-06-11T00:00:00.000Z',
      });

      await store.deleteProcessRecord('job-1');

      expect(publisher.unlink).toHaveBeenCalledWith(
        'training:voices:process:job-1',
      );
      expect(publisher.store.has('training:voices:process:job-1')).toBe(false);
    });

    it('warns instead of throwing when the delete fails', async () => {
      publisher.unlink.mockRejectedValueOnce(new Error('redis down'));

      await store.deleteProcessRecord('job-1');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Failed to delete training process record from Redis',
        }),
      );
    });
  });

  describe('loadJobs', () => {
    it('returns all persisted jobs for the namespace', async () => {
      await store.persistJob({ jobId: 'job-1', status: 'running' });
      await store.persistJob({ jobId: 'job-2', status: 'completed' });

      const jobs = await store.loadJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs.map((job) => job.jobId).sort()).toEqual(['job-1', 'job-2']);
    });

    it('does not return process records or other namespaces', async () => {
      await store.persistJob({ jobId: 'job-1', status: 'running' });
      await store.persistProcessRecord({
        jobId: 'job-1',
        pid: 12345,
        startedAt: '2026-06-11T00:00:00.000Z',
      });
      publisher.store.set(
        'training:images:job:other',
        JSON.stringify({ jobId: 'other', status: 'running' }),
      );

      const jobs = await store.loadJobs();

      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.jobId).toBe('job-1');
    });

    it('returns an empty array when Redis is unavailable', async () => {
      const offlineStore = new TrainingStateStore<TestTrainingJob>(
        'voices',
        logger as unknown as LoggerService,
        createMockRedisService(null),
      );

      expect(await offlineStore.loadJobs()).toEqual([]);
    });

    it('returns an empty array and warns when the read fails', async () => {
      publisher.scan.mockRejectedValueOnce(new Error('scan failed'));

      const jobs = await store.loadJobs();

      expect(jobs).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Failed to load training state from Redis',
        }),
      );
    });

    it('skips corrupt entries and keeps valid ones', async () => {
      await store.persistJob({ jobId: 'job-1', status: 'running' });
      publisher.store.set('training:voices:job:corrupt', 'not-json{');

      const jobs = await store.loadJobs();

      expect(jobs).toEqual([{ jobId: 'job-1', status: 'running' }]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          key: 'training:voices:job:corrupt',
          message: 'Skipping corrupt training state entry in Redis',
        }),
      );
    });
  });

  describe('loadProcessRecords', () => {
    it('returns all persisted process records for the namespace', async () => {
      const record: TrainingProcessRecord = {
        jobId: 'job-1',
        pid: 12345,
        startedAt: '2026-06-11T00:00:00.000Z',
      };
      await store.persistProcessRecord(record);
      await store.persistJob({ jobId: 'job-1', status: 'running' });

      const records = await store.loadProcessRecords();

      expect(records).toEqual([record]);
    });

    it('survives a simulated restart with a fresh store instance', async () => {
      const record: TrainingProcessRecord = {
        jobId: 'job-1',
        pid: 12345,
        startedAt: '2026-06-11T00:00:00.000Z',
      };
      await store.persistProcessRecord(record);

      const restartedStore = new TrainingStateStore<TestTrainingJob>(
        'voices',
        logger as unknown as LoggerService,
        createMockRedisService(publisher),
      );

      expect(await restartedStore.loadProcessRecords()).toEqual([record]);
    });
  });

  describe('loadJob', () => {
    it('returns a persisted job by id', async () => {
      const job: TestTrainingJob = { jobId: 'job-1', status: 'running' };
      await store.persistJob(job);

      expect(await store.loadJob('job-1')).toEqual(job);
    });

    it('returns null for an unknown job id', async () => {
      expect(await store.loadJob('missing')).toBeNull();
    });

    it('returns null when Redis is unavailable', async () => {
      const offlineStore = new TrainingStateStore<TestTrainingJob>(
        'voices',
        logger as unknown as LoggerService,
        createMockRedisService(null),
      );

      expect(await offlineStore.loadJob('job-1')).toBeNull();
    });

    it('returns null and warns when the read fails', async () => {
      publisher.get.mockRejectedValueOnce(new Error('read failed'));

      expect(await store.loadJob('job-1')).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Failed to load training job from Redis',
        }),
      );
    });
  });
});
