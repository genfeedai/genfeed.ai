import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { ARTICLE_GENERATION_QUEUE } from '@genfeedai/queue-contracts';
import { BULLMQ_LONG_JOB_WORKER_OPTIONS } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

interface ArticleGenerationJobData {
  transcriptId: string;
  userId: string;
  organizationId: string;
  brandId: string;
}

@Processor(ARTICLE_GENERATION_QUEUE, BULLMQ_LONG_JOB_WORKER_OPTIONS)
export class ArticleGenerationProcessor extends WorkerHost {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly generationEventWebhookService: GenerationEventWebhookService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<ArticleGenerationJobData>): Promise<void> {
    const { transcriptId, userId, organizationId, brandId } = job.data;

    this.logger.log(
      `Generating article from transcript: ${transcriptId} for user ${userId}`,
    );

    try {
      await job.updateProgress(10);

      const article = await this.articlesService.generateFromTranscript(
        transcriptId,
        userId,
        organizationId,
        brandId,
      );

      await job.updateProgress(100);

      this.logger.log(
        `Article generated successfully: ${article.id} from transcript ${transcriptId}`,
      );

      await this.generationEventWebhookService.emitGenerationCompleted({
        brandId,
        generationId: String(article.id ?? ''),
        kind: 'article',
        organizationId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to generate article from transcript ${transcriptId}`,
        (error as Error).stack,
      );

      await this.generationEventWebhookService.emitGenerationFailed({
        brandId,
        errorMessage: (error as Error)?.message ?? null,
        // No article row exists on failure, so the transcript is the stable
        // identifier a subscriber can correlate the job by.
        generationId: transcriptId,
        kind: 'article',
        organizationId,
        retryable: true,
      });

      throw error;
    }
  }
}
