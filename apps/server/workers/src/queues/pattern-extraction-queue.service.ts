import {
  PATTERN_EXTRACTION_QUEUE,
  type PatternExtractionJobData,
} from '@genfeedai/queue-contracts';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class PatternExtractionQueueService {
  constructor(
    @InjectQueue(PATTERN_EXTRACTION_QUEUE)
    private readonly queue: Queue<PatternExtractionJobData>,
  ) {}

  async enqueueScan(): Promise<void> {
    const utcDate = new Date().toISOString().slice(0, 10);

    await this.queue.add(
      PATTERN_EXTRACTION_QUEUE,
      {},
      {
        attempts: 2,
        backoff: { delay: 10000, type: 'exponential' },
        jobId: `pattern-extraction-${utcDate}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  }
}
