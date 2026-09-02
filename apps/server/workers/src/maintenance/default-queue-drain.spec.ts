import {
  DEFAULT_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/contracts/queue';
import {
  drainDefaultQueue,
  parseDefaultQueueDrainArgs,
} from '@workers/maintenance/default-queue-drain';
import type { Job } from 'bullmq';

function job(name: string, data: unknown = {}): Job {
  return { data, name, remove: vi.fn() } as unknown as Job;
}

describe('default queue drain', () => {
  it('defaults to a dry run and rejects ambiguous arguments', () => {
    expect(parseDefaultQueueDrainArgs([])).toEqual({
      dryRun: true,
      purgeUnroutable: false,
    });
    expect(
      parseDefaultQueueDrainArgs(['--live', '--purge-unroutable']),
    ).toEqual({ dryRun: false, purgeUnroutable: true });
    expect(() => parseDefaultQueueDrainArgs(['--dry-run', '--live'])).toThrow(
      'Choose either --dry-run or --live, not both.',
    );
    expect(() => parseDefaultQueueDrainArgs(['--all'])).toThrow(
      'Unknown argument: --all',
    );
  });

  it('counts every waiting job by name without mutating anything in dry-run mode', async () => {
    const stranded = job(NOTIFICATION_DELIVERY_QUEUE);
    const alsoStranded = job(NOTIFICATION_DELIVERY_QUEUE);
    const orphan = job('some-deleted-job');
    const defaultQueue = {
      getWaiting: vi.fn().mockResolvedValue([stranded, alsoStranded, orphan]),
    };
    const createQueueWriter = vi.fn();

    const report = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: true,
      purgeUnroutable: false,
    });

    expect(defaultQueue.getWaiting).toHaveBeenCalledWith(0, -1);
    expect(createQueueWriter).not.toHaveBeenCalled();
    expect(stranded.remove).not.toHaveBeenCalled();
    expect(orphan.remove).not.toHaveBeenCalled();
    expect(report).toEqual({
      byJobName: { 'some-deleted-job': 1, [NOTIFICATION_DELIVERY_QUEUE]: 2 },
      dryRun: true,
      purged: 0,
      rerouted: 0,
      unroutable: 1,
      waiting: 3,
    });
  });

  it('reroutes each misrouted job to the queue its name identifies', async () => {
    const notificationJob = job(NOTIFICATION_DELIVERY_QUEUE, {
      brandId: 'brand-1',
    });
    const workflowJob = job(WORKFLOW_EXECUTION_QUEUE, { postId: 'post-1' });
    const defaultQueue = {
      getWaiting: vi.fn().mockResolvedValue([notificationJob, workflowJob]),
    };
    const writers = new Map<string, { add: ReturnType<typeof vi.fn> }>();
    const createQueueWriter = vi.fn((queueName: string) => {
      const writer = { add: vi.fn() };
      writers.set(queueName, writer);
      return writer;
    });

    const report = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: false,
    });

    expect(writers.get(NOTIFICATION_DELIVERY_QUEUE)?.add).toHaveBeenCalledWith(
      NOTIFICATION_DELIVERY_QUEUE,
      { brandId: 'brand-1' },
    );
    expect(writers.get(WORKFLOW_EXECUTION_QUEUE)?.add).toHaveBeenCalledWith(
      WORKFLOW_EXECUTION_QUEUE,
      { postId: 'post-1' },
    );
    expect(notificationJob.remove).toHaveBeenCalled();
    expect(workflowJob.remove).toHaveBeenCalled();
    expect(report.rerouted).toBe(2);
    expect(report.unroutable).toBe(0);
  });

  it('leaves jobs whose destination is unknown in place unless purging is requested', async () => {
    const orphan = job('some-deleted-job');
    const selfNamed = job(DEFAULT_QUEUE);
    const defaultQueue = {
      getWaiting: vi.fn().mockResolvedValue([orphan, selfNamed]),
    };
    const createQueueWriter = vi.fn();

    const kept = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: false,
    });

    expect(createQueueWriter).not.toHaveBeenCalled();
    expect(orphan.remove).not.toHaveBeenCalled();
    expect(selfNamed.remove).not.toHaveBeenCalled();
    expect(kept).toMatchObject({ purged: 0, rerouted: 0, unroutable: 2 });

    const purged = await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: true,
    });

    expect(orphan.remove).toHaveBeenCalled();
    expect(selfNamed.remove).toHaveBeenCalled();
    expect(purged).toMatchObject({ purged: 2, rerouted: 0, unroutable: 2 });
  });

  it('reuses one writer per destination queue', async () => {
    const defaultQueue = {
      getWaiting: vi
        .fn()
        .mockResolvedValue([
          job(NOTIFICATION_DELIVERY_QUEUE),
          job(NOTIFICATION_DELIVERY_QUEUE),
          job(NOTIFICATION_DELIVERY_QUEUE),
        ]),
    };
    const createQueueWriter = vi.fn(() => ({ add: vi.fn() }));

    await drainDefaultQueue(defaultQueue, createQueueWriter, {
      dryRun: false,
      purgeUnroutable: false,
    });

    expect(createQueueWriter).toHaveBeenCalledTimes(1);
  });
});
