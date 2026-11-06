import {
  type BaseJobDataWithPriority,
  BaseQueueService,
  DEFAULT_JOB_CONFIG,
} from '@files/shared/services/base-queue/base-queue.service';
import {
  FILE_JOB_PRIORITY as JOB_PRIORITY,
  FILE_JOB_TYPES as JOB_TYPES,
} from '@genfeedai/contracts/queue';
import type { Job, Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface TestJobData extends BaseJobDataWithPriority {
  fileId: string;
  ingredientId?: string;
}

interface StoredJob {
  data: TestJobData;
  finishedOn?: number;
  id: string;
  name: string;
  opts: Record<string, unknown>;
  state: 'waiting' | 'delayed' | 'active' | 'completed' | 'failed';
}

class TestQueueService extends BaseQueueService<TestJobData> {
  protected override readonly jobConfigs = {
    [JOB_TYPES.DOWNLOAD_FILE]: {
      attempts: 5,
      defaultPriority: JOB_PRIORITY.HIGH,
      delay: 1000,
    },
  };

  addDownload(data: TestJobData): Promise<Job<TestJobData>> {
    return this.addJob(JOB_TYPES.DOWNLOAD_FILE, data, 'download', data.fileId);
  }

  addWithId(data: TestJobData, jobId: string): Promise<Job<TestJobData>> {
    return this.addJob(
      JOB_TYPES.DOWNLOAD_FILE,
      data,
      'download',
      data.fileId,
      jobId,
    );
  }

  addDelayedDownload(
    data: TestJobData,
    delayMs: number,
  ): Promise<Job<TestJobData>> {
    return this.addJobWithDelay(
      JOB_TYPES.DOWNLOAD_FILE,
      data,
      delayMs,
      'delayed-download',
      data.fileId,
    );
  }
}

class UnconfiguredQueueService extends BaseQueueService<TestJobData> {
  addUpload(data: TestJobData): Promise<Job<TestJobData>> {
    return this.addJob(JOB_TYPES.UPLOAD_TO_S3, data, 'upload');
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NOW = new Date('2026-11-06T12:00:00.000Z').getTime();
const HOUR = 3_600_000;

describe('BaseQueueService', () => {
  let jobs: StoredJob[];
  let isPaused: boolean;
  let queue: Queue<TestJobData>;
  let service: TestQueueService;

  const job = (index: number) => jobs[index];
  const seedFinished = (
    id: string,
    state: 'completed' | 'failed',
    age: number,
  ) => {
    jobs.push({
      data: { fileId: id },
      finishedOn: NOW - age,
      id,
      name: JOB_TYPES.DOWNLOAD_FILE,
      opts: {},
      state,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    jobs = [];
    isPaused = false;

    // A BullMQ queue held in memory: jobs keep their options and state.
    queue = {
      add: async (
        name: string,
        data: TestJobData,
        opts: Record<string, unknown>,
      ) => {
        const stored: StoredJob = {
          data,
          id: String(opts.jobId),
          name,
          opts,
          state: opts.delay ? 'delayed' : 'waiting',
        };
        jobs.push(stored);
        return stored;
      },
      clean: async (grace: number, _limit: number, state: string) => {
        jobs = jobs.filter(
          (stored) =>
            stored.state !== state ||
            (stored.finishedOn ?? NOW) > Date.now() - grace,
        );
        return [];
      },
      getJob: async (id: string) => jobs.find((stored) => stored.id === id),
      getJobCounts: async () => {
        const counts: Record<string, number> = {};
        for (const stored of jobs) {
          counts[stored.state] = (counts[stored.state] ?? 0) + 1;
        }
        return counts;
      },
      pause: async () => {
        isPaused = true;
      },
      resume: async () => {
        isPaused = false;
      },
    } as unknown as Queue<TestJobData>;
    service = new TestQueueService(queue, TestQueueService.name);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addJob', () => {
    it('queues the job with its configured retry policy and priority', async () => {
      const added = await service.addDownload({ fileId: 'file-1' });

      expect(jobs).toEqual([
        {
          data: { fileId: 'file-1' },
          id: added.id,
          name: JOB_TYPES.DOWNLOAD_FILE,
          opts: {
            attempts: 5,
            backoff: { delay: 1000, type: 'exponential' },
            jobId: added.id,
            priority: JOB_PRIORITY.HIGH,
          },
          state: 'waiting',
        },
      ]);
    });

    it('assigns distinct opaque ids instead of queue-local counters', async () => {
      await service.addDownload({ fileId: 'file-1' });
      await service.addDownload({ fileId: 'file-1' });

      expect(job(0)?.id).toMatch(UUID);
      expect(job(1)?.id).toMatch(UUID);
      expect(job(1)?.id).not.toBe(job(0)?.id);
    });

    it('keeps a caller-provided id for idempotent jobs', async () => {
      await service.addWithId({ fileId: 'file-1' }, 'video-stitch-output-1');

      expect(job(0)?.id).toBe('video-stitch-output-1');
    });

    it('lets the job data raise or lower its priority', async () => {
      await service.addDownload({
        fileId: 'file-1',
        priority: JOB_PRIORITY.LOW,
      });

      expect(job(0)?.opts.priority).toBe(JOB_PRIORITY.LOW);
    });

    it('falls back to the default policy for an unconfigured job type', async () => {
      await new UnconfiguredQueueService(queue, 'Unconfigured').addUpload({
        fileId: 'file-2',
      });

      expect(job(0)).toMatchObject({
        name: JOB_TYPES.UPLOAD_TO_S3,
        opts: {
          attempts: DEFAULT_JOB_CONFIG.attempts,
          backoff: { delay: DEFAULT_JOB_CONFIG.delay, type: 'exponential' },
          priority: DEFAULT_JOB_CONFIG.defaultPriority,
        },
      });
    });
  });

  it('delays a job with an opaque id and the configured attempts', async () => {
    await service.addDelayedDownload({ fileId: 'file-1' }, 5000);

    expect(job(0)).toMatchObject({
      opts: { attempts: 5, delay: 5000 },
      state: 'delayed',
    });
    expect(job(0)?.id).toMatch(UUID);
  });

  it('finds a queued job by id', async () => {
    const added = await service.addDownload({ fileId: 'file-1' });

    await expect(service.getJob(added.id ?? '')).resolves.toMatchObject({
      data: { fileId: 'file-1' },
    });
    await expect(service.getJob('unknown')).resolves.toBeUndefined();
  });

  it('counts jobs by state', async () => {
    await service.addDownload({ fileId: 'file-1' });
    await service.addDelayedDownload({ fileId: 'file-2' }, 1000);
    seedFinished('done', 'completed', 0);

    await expect(service.getJobCounts()).resolves.toEqual({
      completed: 1,
      delayed: 1,
      waiting: 1,
    });
  });

  it.each([
    [undefined, ['recent-done', 'failed-90m', 'pending']],
    [HOUR / 2, ['recent-done', 'pending']],
  ])(
    'cleans finished jobs past the grace period (%s ms)',
    async (grace, kept) => {
      seedFinished('old-done', 'completed', 2 * HOUR);
      seedFinished('recent-done', 'completed', HOUR / 4);
      seedFinished('failed-90m', 'failed', 1.5 * HOUR);
      seedFinished('old-failed', 'failed', 3 * HOUR);
      await service.addWithId({ fileId: 'file-1' }, 'pending');

      await service.clean(grace);

      expect(jobs.map(({ id }) => id)).toEqual(kept);
    },
  );

  it('pauses and resumes the queue', async () => {
    await service.pause();
    const wasPaused = isPaused;
    await service.resume();

    expect([wasPaused, isPaused]).toEqual([true, false]);
  });
});
