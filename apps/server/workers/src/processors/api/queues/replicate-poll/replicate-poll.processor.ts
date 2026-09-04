import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { isAllowedReplicateOutputUrl } from '@api/endpoints/webhooks/replicate/webhooks.replicate.constants';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { ReplicatePollQueueService } from '@api/queues/replicate-poll/replicate-poll-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { IngredientStatus } from '@genfeedai/contracts';
import {
  REPLICATE_POLL_MAX_ATTEMPTS,
  REPLICATE_POLL_QUEUE,
  type ReplicatePollJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(REPLICATE_POLL_QUEUE, {
  concurrency: 5,
  limiter: { duration: 60_000, max: 60 },
})
export class ReplicatePollProcessor extends WorkerHost {
  private readonly logContext = ReplicatePollProcessor.name;

  constructor(
    private readonly ingredients: IngredientsService,
    private readonly logger: LoggerService,
    private readonly pollQueue: ReplicatePollQueueService,
    private readonly replicate: ReplicateService,
    private readonly webhooks: WebhooksService,
  ) {
    super();
  }

  async process(job: Job<ReplicatePollJobData>): Promise<void> {
    const ingredient = await this.ingredients.findOne({
      id: job.data.ingredientId,
      isDeleted: false,
      organizationId: job.data.organizationId,
    });
    if (!ingredient || ingredient.status !== IngredientStatus.PROCESSING) {
      return;
    }

    const prediction = (await this.replicate.getPrediction(
      job.data.externalId,
    )) as Record<string, unknown>;
    const status =
      typeof prediction.status === 'string' ? prediction.status : '';
    if (
      status === 'starting' ||
      status === 'processing' ||
      status === 'queued'
    ) {
      if (job.data.attempt >= REPLICATE_POLL_MAX_ATTEMPTS) {
        await this.webhooks.handleFailedGenerationForIngredient(
          job.data.ingredientId,
          'Replicate polling timed out',
        );
        return;
      }
      await this.pollQueue.schedule({
        ...job.data,
        attempt: job.data.attempt + 1,
      });
      return;
    }

    const output = this.resolveOutput(prediction.output, job.data.outputIndex);
    if ((status === 'succeeded' || status === 'completed') && output) {
      const storedExternalId =
        job.data.outputIndex === undefined
          ? job.data.externalId
          : `${job.data.externalId}_${job.data.outputIndex}`;
      await this.webhooks.processMediaForIngredient(
        job.data.ingredientId,
        job.data.category,
        output,
        storedExternalId,
      );
      return;
    }

    const error =
      typeof prediction.error === 'string'
        ? prediction.error
        : `Replicate prediction ${job.data.externalId} ended with status ${status || 'unknown'} without an allowed output`;
    await this.webhooks.handleFailedGenerationForIngredient(
      job.data.ingredientId,
      error,
    );
    this.logger.error(`${this.logContext}: generation failed`, {
      error,
      externalId: job.data.externalId,
      ingredientId: job.data.ingredientId,
    });
  }

  private resolveOutput(
    output: unknown,
    outputIndex?: number,
  ): string | undefined {
    const candidate = Array.isArray(output)
      ? output[outputIndex ?? 0]
      : outputIndex === undefined
        ? output
        : undefined;
    return isAllowedReplicateOutputUrl(candidate) ? candidate : undefined;
  }
}
