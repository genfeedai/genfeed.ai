import {
  type TaskJobData,
  TaskQueueService,
} from '@files/queues/task-queue.service';
import type { Queue } from 'bullmq';

interface FakeJob {
  data: TaskJobData;
  finishedOn?: number;
  id: string;
  name: string;
  opts: Record<string, unknown>;
  state: 'active' | 'completed' | 'failed' | 'waiting';
}

/**
 * In-memory BullMQ queue: jobs keep their name, data and options, `clean`
 * drops finished jobs older than the grace period, and counts are read off
 * the stored jobs.
 */
function createQueue(now: () => number) {
  const jobs: FakeJob[] = [];
  const queue = {
    add: async (name: string, data: TaskJobData, opts: { jobId: string }) => {
      const job: FakeJob = {
        data,
        id: opts.jobId,
        name,
        opts,
        state: 'waiting',
      };
      jobs.push(job);
      return job;
    },
    clean: async (grace: number, _limit: number, state: FakeJob['state']) => {
      const stale = jobs.filter(
        (job) =>
          job.state === state &&
          job.finishedOn !== undefined &&
          now() - job.finishedOn > grace,
      );
      for (const job of stale) jobs.splice(jobs.indexOf(job), 1);
      return stale.map((job) => job.id);
    },
    getJob: async (id: string) => jobs.find((job) => job.id === id),
    getJobCounts: async () =>
      Object.fromEntries(
        (['active', 'completed', 'failed', 'waiting'] as const).map((state) => [
          state,
          jobs.filter((job) => job.state === state).length,
        ]),
      ),
  };
  return { jobs, queue: queue as unknown as Queue<TaskJobData> };
}

const jobData = (config: TaskJobData['config']): TaskJobData => ({
  assetId: 'asset-abc',
  config,
  organizationId: 'org-789',
  taskId: 'task-123',
  userId: 'user-456',
});

const HOUR = 3_600_000;

const storedJob = (
  id: string,
  state: FakeJob['state'],
  finishedOn?: number,
): FakeJob => ({
  data: jobData({}),
  finishedOn,
  id,
  name: 'clip-media',
  opts: {},
  state,
});
const NOW = 10 * HOUR;

function setup() {
  const { jobs, queue } = createQueue(() => NOW);
  return { jobs, service: new TaskQueueService(queue) };
}

describe('TaskQueueService', () => {
  it.each([
    [
      'addTransformJob',
      'transform-media',
      2000,
      { aspectRatio: '9:16', orientation: 'portrait' },
    ],
    ['addUpscaleJob', 'upscale-media', 3000, { resolution: '4k' }],
    [
      'addCaptionJob',
      'caption-media',
      2000,
      { captionContent: 'Launch day', captionLanguage: 'en' },
    ],
    ['addResizeJob', 'resize-media', 2000, { height: 1080, width: 1920 }],
    ['addClipJob', 'clip-media', 2500, { count: 3, duration: 10 }],
  ] as const)(
    '%s queues a %s job with three attempts and exponential backoff',
    async (method, name, delay, config) => {
      const { jobs, service } = setup();
      const data = jobData(config);

      const job = await service[method](data);

      expect(jobs).toEqual([
        {
          data,
          id: job.id,
          name,
          opts: expect.objectContaining({
            attempts: 3,
            backoff: { delay, type: 'exponential' },
            priority: 5,
          }),
          state: 'waiting',
        },
      ]);
    },
  );

  it('keeps a priority the caller asked for', async () => {
    const { jobs, service } = setup();

    await service.addResizeJob({
      ...jobData({ height: 1080, width: 1920 }),
      priority: 1,
    });

    expect(jobs[0].opts).toMatchObject({ priority: 1 });
  });

  it('gives every queued job its own id and finds it again', async () => {
    const { service } = setup();

    const first = await service.addClipJob(jobData({ count: 1 }));
    const second = await service.addClipJob(jobData({ count: 2 }));

    expect(first.id).not.toBe(second.id);
    await expect(service.getJob(String(second.id))).resolves.toMatchObject({
      data: { config: { count: 2 } },
    });
    await expect(service.getJob('missing')).resolves.toBeUndefined();
  });

  it('counts jobs by state', async () => {
    const { jobs, service } = setup();
    await service.addClipJob(jobData({ count: 1 }));
    await service.addClipJob(jobData({ count: 2 }));
    jobs[1].state = 'failed';

    await expect(service.getJobCounts()).resolves.toEqual({
      active: 0,
      completed: 0,
      failed: 1,
      waiting: 1,
    });
  });

  it('cleans completed jobs past the grace period and failed jobs past twice that', async () => {
    const { jobs, service } = setup();
    jobs.push(
      storedJob('job-0', 'completed', NOW - 2 * HOUR),
      storedJob('job-1', 'completed', NOW - HOUR / 2),
      storedJob('job-2', 'failed', NOW - 3 * HOUR),
      storedJob('job-3', 'failed', NOW - 1.5 * HOUR),
      storedJob('job-4', 'waiting'),
    );

    await service.clean(HOUR);

    expect(jobs.map((job) => job.id)).toEqual(['job-1', 'job-3', 'job-4']);
  });
});
