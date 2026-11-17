import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { HiggsFieldPollQueueService } from '@api/queues/higgsfield-poll/higgsfield-poll-queue.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  HIGGSFIELD_POLL_MAX_ATTEMPTS,
  HIGGSFIELD_POLL_QUEUE,
  type HiggsFieldPollJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

/**
 * Finishes a Higgsfield video request the API already accepted. The request id
 * is saved on the ingredient before this job exists, so a restart or deploy
 * between submission and completion resumes the same paid job here rather than
 * losing it.
 */
@Processor(HIGGSFIELD_POLL_QUEUE, {
  concurrency: 5,
  limiter: { duration: 60_000, max: 60 },
})
export class HiggsFieldPollProcessor extends WorkerHost {
  private readonly logContext = HiggsFieldPollProcessor.name;

  constructor(
    private readonly higgsField: HiggsFieldService,
    private readonly ingredients: IngredientsService,
    private readonly logger: LoggerService,
    private readonly pollQueue: HiggsFieldPollQueueService,
    private readonly webhooks: WebhooksService,
  ) {
    super();
  }

  async process(job: Job<HiggsFieldPollJobData>): Promise<void> {
    const { data } = job;
    const ingredient = await this.ingredients.findOneSelect(
      {
        id: data.ingredientId,
        isDeleted: false,
        organizationId: data.organizationId,
      },
      { status: true },
    );
    if (ingredient?.status !== IngredientStatus.PROCESSING) {
      return;
    }

    const request = await this.higgsField.readVideoRequest(
      data.externalId,
      data.organizationId,
    );

    if (request.state === 'completed') {
      await this.webhooks.processMediaForIngredient(
        data.ingredientId,
        IngredientCategory.VIDEO,
        request.videoUrl,
        data.externalId,
      );
      return;
    }

    if (request.state === 'failed') {
      await this.webhooks.handleFailedGenerationForIngredient(
        data.ingredientId,
        request.reason,
      );
      this.logger.error(`${this.logContext}: generation failed`, {
        externalId: data.externalId,
        ingredientId: data.ingredientId,
        reason: request.reason,
      });
      return;
    }

    if (data.attempt >= HIGGSFIELD_POLL_MAX_ATTEMPTS) {
      await this.webhooks.handleFailedGenerationForIngredient(
        data.ingredientId,
        'Higgsfield polling timed out',
      );
      return;
    }
    await this.pollQueue.schedule({ ...data, attempt: data.attempt + 1 });
  }
}
