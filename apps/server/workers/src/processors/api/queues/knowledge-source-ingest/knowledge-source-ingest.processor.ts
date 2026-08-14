import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { KnowledgeSourceIngestQueueService } from '@api/queues/knowledge-source-ingest/knowledge-source-ingest-queue.service';
import {
  KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME,
  KNOWLEDGE_SOURCE_INGEST_JOB_NAME,
  KNOWLEDGE_SOURCE_INGEST_QUEUE,
  type KnowledgeSourceBackfillJobData,
  type KnowledgeSourceIngestJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(KNOWLEDGE_SOURCE_INGEST_QUEUE)
export class KnowledgeSourceIngestProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly ingestService: KnowledgeSourceIngestService,
    private readonly ingestQueue: KnowledgeSourceIngestQueueService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'knowledge-source-ingest',
      this.logger,
    );
  }

  async process(
    job: Job<KnowledgeSourceIngestJobData | KnowledgeSourceBackfillJobData>,
  ): Promise<void> {
    try {
      await this.circuitBreaker.execute(async () => {
        if (job.name === KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME) {
          await this.processBackfill(
            job.data as KnowledgeSourceBackfillJobData,
          );
          return;
        }

        if (job.name !== KNOWLEDGE_SOURCE_INGEST_JOB_NAME) {
          this.logger.warn('Ignoring unknown knowledge-source job', {
            jobName: job.name,
          });
          return;
        }

        await this.ingestService.ingest(
          job.data as KnowledgeSourceIngestJobData,
        );
      });
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
      }
      throw error;
    }
  }

  private async processBackfill(
    data: KnowledgeSourceBackfillJobData,
  ): Promise<void> {
    const scan = await this.ingestService.scanForBackfill(data);
    this.logger.log('Knowledge source backfill scan complete', {
      organizationId: data.organizationId,
      queued: scan.queued.length,
    });

    for (const item of scan.queued) {
      await this.ingestQueue.enqueueIngest(item);
    }
  }
}
