import {
  ALL_QUEUE_NAMES,
  DEFAULT_QUEUE,
  hasQueueConsumer,
  type QueueName,
} from '@genfeedai/contracts/queue';
import type { Job } from 'bullmq';

export interface DefaultQueueDrainArgs {
  dryRun: boolean;
  purgeUnroutable: boolean;
}

export interface DefaultQueueDrainReport {
  byJobName: Record<string, number>;
  dryRun: boolean;
  purged: number;
  rerouted: number;
  unroutable: number;
  waiting: number;
}

interface WaitingJobsReader {
  getWaiting(start: number, end: number): Promise<Job[]>;
}

interface QueueWriter {
  add(name: string, data: unknown): Promise<unknown>;
}

export type QueueWriterFactory = (queueName: QueueName) => QueueWriter;

const CONTRACT_QUEUE_NAMES: ReadonlySet<string> = new Set(ALL_QUEUE_NAMES);

/**
 * A job sitting in `default` is routable when its job name is itself a contract
 * queue that a worker drains. `QueueService.add` names every job after the queue
 * it targets, so a misrouted job carries its real destination in `job.name`.
 */
function resolveDestination(job: Job): QueueName | undefined {
  if (job.name === DEFAULT_QUEUE) {
    return undefined;
  }
  if (!CONTRACT_QUEUE_NAMES.has(job.name) || !hasQueueConsumer(job.name)) {
    return undefined;
  }
  return job.name as QueueName;
}

export function parseDefaultQueueDrainArgs(
  args: readonly string[],
): DefaultQueueDrainArgs {
  let sawDryRun = false;
  let sawLive = false;
  let purgeUnroutable = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      sawDryRun = true;
      continue;
    }
    if (arg === '--live') {
      sawLive = true;
      continue;
    }
    if (arg === '--purge-unroutable') {
      purgeUnroutable = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (sawDryRun && sawLive) {
    throw new Error('Choose either --dry-run or --live, not both.');
  }

  return { dryRun: !sawLive, purgeUnroutable };
}

/**
 * Drains the `default` queue, which has producers but no `@Processor`.
 *
 * Jobs whose name identifies a consumed contract queue are re-enqueued there and
 * removed from `default`. Jobs that name nothing routable are reported and left
 * in place — deleting work whose destination is unknown is not a repair — unless
 * the operator opts in with `--purge-unroutable`.
 */
export async function drainDefaultQueue(
  defaultQueue: WaitingJobsReader,
  createQueueWriter: QueueWriterFactory,
  args: DefaultQueueDrainArgs,
): Promise<DefaultQueueDrainReport> {
  const waitingJobs = await defaultQueue.getWaiting(0, -1);

  const byJobName = waitingJobs.reduce<Record<string, number>>(
    (counts, job) => {
      counts[job.name] = (counts[job.name] ?? 0) + 1;
      return counts;
    },
    {},
  );

  const routable: Array<{ destination: QueueName; job: Job }> = [];
  const unroutable: Job[] = [];

  for (const job of waitingJobs) {
    const destination = resolveDestination(job);
    if (destination) {
      routable.push({ destination, job });
      continue;
    }
    unroutable.push(job);
  }

  if (args.dryRun) {
    return {
      byJobName,
      dryRun: true,
      purged: 0,
      rerouted: 0,
      unroutable: unroutable.length,
      waiting: waitingJobs.length,
    };
  }

  const writers = new Map<QueueName, QueueWriter>();

  for (const { destination, job } of routable) {
    let writer = writers.get(destination);
    if (!writer) {
      writer = createQueueWriter(destination);
      writers.set(destination, writer);
    }
    await writer.add(destination, job.data);
    await job.remove();
  }

  const purgable = args.purgeUnroutable ? unroutable : [];
  for (const job of purgable) {
    await job.remove();
  }

  return {
    byJobName,
    dryRun: false,
    purged: purgable.length,
    rerouted: routable.length,
    unroutable: unroutable.length,
    waiting: waitingJobs.length,
  };
}
