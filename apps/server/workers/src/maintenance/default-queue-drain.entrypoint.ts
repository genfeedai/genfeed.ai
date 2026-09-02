import '../instrument';

import { bootstrap } from '@libs/bootstrap';

bootstrap({ app: 'workers' });

import process from 'node:process';
import { DEFAULT_QUEUE, type QueueName } from '@genfeedai/contracts/queue';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { Logger } from '@nestjs/common';
import {
  drainDefaultQueue,
  parseDefaultQueueDrainArgs,
} from '@workers/maintenance/default-queue-drain';
import { Queue } from 'bullmq';

const logger = new Logger('DefaultQueueDrain');

async function main(): Promise<void> {
  const args = parseDefaultQueueDrainArgs(process.argv.slice(2));
  const environment = {
    get: (key: string): string | undefined => process.env[key],
  };
  const redisConfig = parseRedisConnectionForWorkload(
    environment,
    RedisWorkload.QUEUE,
  );
  const connection = buildBullMQConnection(redisConfig);
  const defaultQueue = new Queue(DEFAULT_QUEUE, { connection });
  const destinationQueues = new Map<QueueName, Queue>();

  try {
    logger.log(
      `Starting ${DEFAULT_QUEUE} queue drain (${args.dryRun ? 'DRY-RUN' : 'LIVE'})`,
    );
    if (!args.dryRun) {
      logger.warn(
        `LIVE mode: waiting jobs will be re-enqueued onto the queue named by each job and removed from ${DEFAULT_QUEUE}.`,
      );
    }
    if (args.purgeUnroutable) {
      logger.warn(
        'LIVE mode: jobs with no resolvable destination will be deleted permanently.',
      );
    }

    const report = await drainDefaultQueue(
      defaultQueue,
      (queueName) => {
        const existing = destinationQueues.get(queueName);
        if (existing) {
          return existing;
        }
        const queue = new Queue(queueName, { connection });
        destinationQueues.set(queueName, queue);
        return queue;
      },
      args,
    );

    logger.log(`Drain report: ${JSON.stringify(report)}`);

    if (args.dryRun && report.waiting > 0) {
      logger.log('Review the report, then re-run with --live to apply.');
    }
    if (report.unroutable > 0 && !args.purgeUnroutable) {
      logger.warn(
        `${report.unroutable} job(s) name no consumed queue and were left in place. Re-run with --purge-unroutable once the report confirms they are dead work.`,
      );
    }
  } finally {
    await Promise.all([
      defaultQueue.close(),
      ...[...destinationQueues.values()].map((queue) => queue.close()),
    ]);
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.error(
      'Default queue drain failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  });
