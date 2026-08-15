import '../instrument';

import { bootstrap } from '@libs/bootstrap';

bootstrap({ app: 'workers' });

import process from 'node:process';
import {
  DEFAULT_QUEUE,
  PATTERN_EXTRACTION_QUEUE,
} from '@genfeedai/queue-contracts';
import {
  buildBullMQConnection,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import { Logger } from '@nestjs/common';
import {
  parsePatternExtractionRepairArgs,
  repairPatternExtractionQueue,
} from '@workers/maintenance/pattern-extraction-queue-repair';
import { PatternExtractionQueueService } from '@workers/queues/pattern-extraction-queue.service';
import { Queue } from 'bullmq';

const logger = new Logger('PatternExtractionQueueRepair');

async function main(): Promise<void> {
  const args = parsePatternExtractionRepairArgs(process.argv.slice(2));
  const environment = {
    get: (key: string): string | undefined => process.env[key],
  };
  const redisConfig = parseRedisConnectionForWorkload(
    environment,
    RedisWorkload.QUEUE,
  );
  const connection = buildBullMQConnection(redisConfig);
  const defaultQueue = new Queue(DEFAULT_QUEUE, { connection });
  const patternExtractionQueue = new Queue(PATTERN_EXTRACTION_QUEUE, {
    connection,
  });

  try {
    logger.log(
      `Starting pattern extraction queue repair (${args.dryRun ? 'DRY-RUN' : 'LIVE'})`,
    );
    if (!args.dryRun) {
      logger.warn(
        `LIVE mode: waiting ${PATTERN_EXTRACTION_QUEUE} jobs will be removed only from ${DEFAULT_QUEUE}.`,
      );
    }

    const producer = new PatternExtractionQueueService(patternExtractionQueue);
    const report = await repairPatternExtractionQueue(
      defaultQueue,
      producer,
      args,
    );
    logger.log(`Repair report: ${JSON.stringify(report)}`);

    if (args.dryRun && report.matched > 0) {
      logger.log('Review the report, then re-run with --live to apply.');
    }
  } finally {
    await Promise.all([defaultQueue.close(), patternExtractionQueue.close()]);
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.error(
      'Pattern extraction queue repair failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  });
