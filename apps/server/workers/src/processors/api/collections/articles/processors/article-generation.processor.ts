import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

interface ArticleGenerationJobData {
  transcriptId: string;
  userId: string;
  organizationId: string;
  brandId: string;
}

@Processor('article-generation')
export class ArticleGenerationProcessor extends WorkerHost {
  constructor(
    private readonly articlesService: ArticlesService,
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
        `Article generated successfully: ${article._id} from transcript ${transcriptId}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to generate article from transcript ${transcriptId}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
