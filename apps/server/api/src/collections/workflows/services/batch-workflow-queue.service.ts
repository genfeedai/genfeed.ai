import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

// =============================================================================
// TYPES
// =============================================================================

export interface BatchWorkflowItemJobData {
  batchJobId: string;
  itemId: string;
  workflowId: string;
  ingredientId: string;
  userId: string;
  organizationId: string;
}

// =============================================================================
// QUEUE NAME
// =============================================================================

export const BATCH_WORKFLOW_QUEUE = 'batch-workflow';

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class BatchWorkflowQueueService {
  private readonly logContext = 'BatchWorkflowQueueService';

  constructor(
    @InjectQueue(BATCH_WORKFLOW_QUEUE)
    private readonly batchQueue: Queue<BatchWorkflowItemJobData>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Enqueue all items from a batch job for processing.
   */
  async enqueueBatchItems(items: BatchWorkflowItemJobData[]): Promise<void> {
    const jobs = items.map((item) => ({
      data: item,
      name: 'process-batch-item',
      opts: {
        attempts: 2,
        backoff: { delay: 5000, type: 'exponential' as const },
        jobId: `batch-${item.batchJobId}-${item.itemId}`,
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    }));

    await this.batchQueue.addBulk(jobs);

    this.logger.log(`${this.logContext} enqueued ${items.length} batch items`, {
      batchJobId: items[0]?.batchJobId,
      itemCount: items.length,
    });
  }
}
