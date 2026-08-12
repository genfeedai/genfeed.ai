import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import {
  REPLY_POST_WATCH_QUEUE,
  type ReplyPostWatchJobData,
  type ReplyPostWatchResult,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(REPLY_POST_WATCH_QUEUE)
export class ReplyPostWatchProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly replyPostWatchService: ReplyPostWatchService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(this.constructorName);
  }

  async process(
    job: Job<ReplyPostWatchJobData>,
  ): Promise<ReplyPostWatchResult> {
    return this.circuitBreaker.execute(async () => {
      this.logger.log(`${this.constructorName} post-watch attempt`, {
        attempt: job.data.attempt,
        jobId: job.id,
        postId: job.data.postId,
      });
      return this.replyPostWatchService.runWatchAttempt(job.data);
    });
  }
}
