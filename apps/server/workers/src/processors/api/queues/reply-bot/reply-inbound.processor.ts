import { ReplyInboundProcessorService } from '@server/services/reply-bot/reply-inbound-processor.service';
import {
  REPLY_INBOUND_QUEUE,
  type ReplyInboundJobData,
  type ReplyInboundResult,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(REPLY_INBOUND_QUEUE)
export class ReplyInboundProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly replyInboundProcessorService: ReplyInboundProcessorService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(this.constructorName);
  }

  async process(job: Job<ReplyInboundJobData>): Promise<ReplyInboundResult> {
    return this.circuitBreaker.execute(async () => {
      this.logger.log(`${this.constructorName} processing inbound`, {
        commentId: job.data.commentId,
        jobId: job.id,
        source: job.data.source,
      });
      return this.replyInboundProcessorService.process(job.data);
    });
  }
}
