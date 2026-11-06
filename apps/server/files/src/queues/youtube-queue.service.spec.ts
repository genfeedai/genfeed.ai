import { YoutubeQueueService } from '@files/queues/youtube-queue.service';
import type { YoutubeJobData } from '@files/shared/interfaces/job.interface';
import {
  FILE_JOB_PRIORITY as JOB_PRIORITY,
  FILE_JOB_TYPES as JOB_TYPES,
} from '@genfeedai/contracts/queue';
import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface StoredJob {
  data: YoutubeJobData;
  finishedOn?: number;
  id: string;
  name: string;
  opts: Record<string, unknown>;
  state: 'waiting' | 'active' | 'completed' | 'failed';
}

const NOW = new Date('2026-11-06T12:00:00.000Z').getTime();
const HOUR = 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const upload: YoutubeJobData = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  credential: {
    accessToken: 'access-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://app.genfeed.ai/oauth/youtube',
    refreshToken: 'refresh-token',
  },
  description: 'Test description',
  id: 'job-data-001',
  ingredientId: 'ingredient-456',
  isUnlisted: false,
  metadata: { websocketUrl: '/youtube/ingredient-456' },
  organizationId: 'org-789',
  postId: 'post-123',
  status: 'public',
  tags: ['test', 'video'],
  title: 'Test Video',
  type: JOB_TYPES.UPLOAD_YOUTUBE,
  userId: 'user-abc',
};

describe('YoutubeQueueService', () => {
  let jobs: StoredJob[];
  let service: YoutubeQueueService;

  const seedFinished = (
    id: string,
    state: 'completed' | 'failed',
    age: number,
  ) => {
    jobs.push({
      data: upload,
      finishedOn: NOW - age,
      id,
      name: JOB_TYPES.UPLOAD_YOUTUBE,
      opts: {},
      state,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    jobs = [];

    // The YouTube processing queue held in memory.
    const queue = {
      add: async (
        name: string,
        data: YoutubeJobData,
        opts: Record<string, unknown>,
      ) => {
        const stored: StoredJob = {
          data,
          id: String(opts.jobId),
          name,
          opts,
          state: 'waiting',
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
    } as unknown as Queue<YoutubeJobData>;

    service = new YoutubeQueueService(queue);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      'an unlisted upload',
      'addUploadUnlistedJob',
      JOB_TYPES.UPLOAD_YOUTUBE_UNLISTED,
    ],
    ['a public upload', 'addUploadJob', JOB_TYPES.UPLOAD_YOUTUBE],
  ] as const)(
    'queues %s at high priority with three exponential retries',
    async (_case, method, name) => {
      const added = await service[method](upload);

      expect(jobs).toEqual([
        {
          data: upload,
          id: added.id,
          name,
          opts: {
            attempts: 3,
            backoff: { delay: 2000, type: 'exponential' },
            jobId: added.id,
            priority: JOB_PRIORITY.HIGH,
          },
          state: 'waiting',
        },
      ]);
      expect(added.id).toMatch(UUID);
    },
  );

  it.each([['addUploadUnlistedJob'], ['addUploadJob']] as const)(
    'lets the post lower the priority (%s)',
    async (method) => {
      await service[method]({ ...upload, priority: JOB_PRIORITY.LOW });

      expect(jobs[0]?.opts.priority).toBe(JOB_PRIORITY.LOW);
    },
  );

  it('gives every upload of the same post its own job', async () => {
    const first = await service.addUploadJob(upload);
    const second = await service.addUploadJob(upload);

    expect(second.id).not.toBe(first.id);
    expect(jobs).toHaveLength(2);
  });

  it('finds a queued upload by id', async () => {
    const added = await service.addUploadJob(upload);

    await expect(service.getJob(added.id ?? '')).resolves.toMatchObject({
      data: { postId: 'post-123' },
    });
    await expect(service.getJob('non-existent')).resolves.toBeUndefined();
  });

  it('counts uploads by state', async () => {
    await service.addUploadJob(upload);
    seedFinished('done', 'completed', 0);
    seedFinished('broken', 'failed', 0);

    await expect(service.getJobCounts()).resolves.toEqual({
      completed: 1,
      failed: 1,
      waiting: 1,
    });
  });

  it.each([
    [undefined, ['recent-done', 'failed-90m', 'pending']],
    [HOUR / 2, ['recent-done', 'pending']],
  ])(
    'cleans finished uploads past the grace, failures after twice as long (%s ms)',
    async (grace, kept) => {
      seedFinished('old-done', 'completed', 2 * HOUR);
      seedFinished('recent-done', 'completed', HOUR / 4);
      seedFinished('failed-90m', 'failed', 1.5 * HOUR);
      seedFinished('old-failed', 'failed', 3 * HOUR);
      jobs.push({
        data: upload,
        id: 'pending',
        name: JOB_TYPES.UPLOAD_YOUTUBE,
        opts: {},
        state: 'waiting',
      });

      await service.clean(grace);

      expect(jobs.map(({ id }) => id)).toEqual(kept);
    },
  );
});
