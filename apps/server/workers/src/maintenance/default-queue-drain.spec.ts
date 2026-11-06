import {
  DEFAULT_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  type QueueName,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/contracts/queue';
import {
  drainDefaultQueue,
  parseDefaultQueueDrainArgs,
} from '@workers/maintenance/default-queue-drain';
import type { Job } from 'bullmq';

interface QueuedJob {
  data: unknown;
  name: string;
}

describe('default queue drain', () => {
  // Redis as the drain sees it: the default queue plus every destination queue.
  let defaultJobs: QueuedJob[];
  let destinations: Map<string, QueuedJob[]>;
  let writersOpened: string[];

  const defaultQueue = {
    getWaiting: async (start: number, end: number) =>
      defaultJobs.slice(start, end === -1 ? undefined : end + 1).map(
        (queued) =>
          ({
            data: queued.data,
            name: queued.name,
            remove: async () => {
              defaultJobs = defaultJobs.filter((entry) => entry !== queued);
            },
          }) as unknown as Job,
      ),
  };

  const createQueueWriter = (queueName: QueueName) => {
    writersOpened.push(queueName);
    return {
      add: async (name: string, data: unknown) => {
        const queue = destinations.get(queueName) ?? [];
        queue.push({ data, name });
        destinations.set(queueName, queue);
      },
    };
  };

  beforeEach(() => {
    defaultJobs = [];
    destinations = new Map();
    writersOpened = [];
  });

  it.each([
    [[], { dryRun: true, purgeUnroutable: false }],
    [
      ['--live', '--purge-unroutable'],
      { dryRun: false, purgeUnroutable: true },
    ],
    [['--dry-run'], { dryRun: true, purgeUnroutable: false }],
  ])('parses %j', (args, expected) => {
    expect(parseDefaultQueueDrainArgs(args)).toEqual(expected);
  });

  it.each([
    [['--dry-run', '--live'], 'Choose either --dry-run or --live, not both.'],
    [['--all'], 'Unknown argument: --all'],
  ])('rejects %j', (args, message) => {
    expect(() => parseDefaultQueueDrainArgs(args)).toThrow(message);
  });

  it('counts every waiting job by name without mutating anything in dry-run mode', async () => {
    defaultJobs = [
      { data: {}, name: NOTIFICATION_DELIVERY_QUEUE },
      { data: {}, name: NOTIFICATION_DELIVERY_QUEUE },
      { data: {}, name: 'some-deleted-job' },
    ];

    const report = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: true,
      purgeUnroutable: false,
    });

    expect(report).toEqual({
      byJobName: { 'some-deleted-job': 1, [NOTIFICATION_DELIVERY_QUEUE]: 2 },
      dryRun: true,
      purged: 0,
      rerouted: 0,
      unroutable: 1,
      waiting: 3,
    });
    expect(defaultJobs).toHaveLength(3);
    expect(destinations.size).toBe(0);
  });

  it('reroutes each misrouted job to the queue its name identifies', async () => {
    defaultJobs = [
      { data: { brandId: 'brand-1' }, name: NOTIFICATION_DELIVERY_QUEUE },
      { data: { postId: 'post-1' }, name: WORKFLOW_EXECUTION_QUEUE },
    ];

    const report = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: false,
    });

    expect(Object.fromEntries(destinations)).toEqual({
      [NOTIFICATION_DELIVERY_QUEUE]: [
        { data: { brandId: 'brand-1' }, name: NOTIFICATION_DELIVERY_QUEUE },
      ],
      [WORKFLOW_EXECUTION_QUEUE]: [
        { data: { postId: 'post-1' }, name: WORKFLOW_EXECUTION_QUEUE },
      ],
    });
    expect(defaultJobs).toEqual([]);
    expect(report).toMatchObject({ rerouted: 2, unroutable: 0 });
  });

  it('leaves jobs whose destination is unknown in place unless purging is requested', async () => {
    defaultJobs = [
      { data: {}, name: 'some-deleted-job' },
      { data: {}, name: DEFAULT_QUEUE },
    ];

    const kept = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: false,
    });

    expect(kept).toMatchObject({ purged: 0, rerouted: 0, unroutable: 2 });
    expect(defaultJobs).toHaveLength(2);

    const purged = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: true,
    });

    expect(purged).toMatchObject({ purged: 2, rerouted: 0, unroutable: 2 });
    expect(defaultJobs).toEqual([]);
    expect(destinations.size).toBe(0);
  });

  it('reuses one writer per destination queue', async () => {
    defaultJobs = [
      { data: { n: 1 }, name: NOTIFICATION_DELIVERY_QUEUE },
      { data: { n: 2 }, name: NOTIFICATION_DELIVERY_QUEUE },
      { data: { n: 3 }, name: NOTIFICATION_DELIVERY_QUEUE },
    ];

    await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: false,
    });

    expect(writersOpened).toEqual([NOTIFICATION_DELIVERY_QUEUE]);
    expect(destinations.get(NOTIFICATION_DELIVERY_QUEUE)).toHaveLength(3);
  });
});
