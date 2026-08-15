import { PATTERN_EXTRACTION_QUEUE } from '@genfeedai/queue-contracts';
import type { Job } from 'bullmq';

export interface PatternExtractionRepairArgs {
  dryRun: boolean;
}

export interface PatternExtractionRepairReport {
  dryRun: boolean;
  enqueued: boolean;
  matched: number;
  removed: number;
}

interface DefaultQueueReader {
  getWaiting(start: number, end: number): Promise<Job[]>;
}

interface PatternExtractionProducer {
  enqueueOneOffScan(): Promise<void>;
}

export function parsePatternExtractionRepairArgs(
  args: readonly string[],
): PatternExtractionRepairArgs {
  let sawDryRun = false;
  let sawLive = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      sawDryRun = true;
      continue;
    }
    if (arg === '--live') {
      sawLive = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (sawDryRun && sawLive) {
    throw new Error('Choose either --dry-run or --live, not both.');
  }

  return { dryRun: !sawLive };
}

export async function repairPatternExtractionQueue(
  defaultQueue: DefaultQueueReader,
  producer: PatternExtractionProducer,
  args: PatternExtractionRepairArgs,
): Promise<PatternExtractionRepairReport> {
  const waitingJobs = await defaultQueue.getWaiting(0, -1);
  const strandedJobs = waitingJobs.filter(
    (job) => job.name === PATTERN_EXTRACTION_QUEUE,
  );

  if (args.dryRun) {
    return {
      dryRun: true,
      enqueued: false,
      matched: strandedJobs.length,
      removed: 0,
    };
  }

  if (strandedJobs.length > 0) {
    await producer.enqueueOneOffScan();
  }

  await Promise.all(strandedJobs.map((job) => job.remove()));

  return {
    dryRun: false,
    enqueued: strandedJobs.length > 0,
    matched: strandedJobs.length,
    removed: strandedJobs.length,
  };
}
