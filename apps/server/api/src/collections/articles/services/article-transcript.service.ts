import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ActivitySource,
  ArticleCategory,
  ArticleStatus,
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

type ArticleCreator = (
  dto: CreateArticleDto,
  userId: string,
  organizationId: string,
  brandId: string,
) => Promise<ArticleDocument>;

@Injectable()
export class ArticleTranscriptService {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly templatesService?: TemplatesService,
    @Optional() private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional() private readonly modelsService?: ModelsService,
  ) {}

  async generateFromTranscript(
    transcriptId: string,
    userId: string,
    organizationId: string,
    brandId: string,
    createArticle: ArticleCreator,
  ): Promise<ArticleDocument> {
    await this.assertDefaultTextCreditsAvailable(organizationId);

    const transcript = await this.getTranscriptById(transcriptId);
    if (!transcript) {
      throw new NotFoundException('Transcript', transcriptId);
    }

    const userPrompt = await this.templatesService?.getRenderedPrompt(
      PromptTemplateKey.ARTICLE_TRANSCRIPT,
      {
        transcriptText: transcript.transcriptText,
        videoTitle: transcript.videoTitle || 'Untitled',
      },
      organizationId,
    );
    if (!userPrompt) {
      throw new Error('Template service not available');
    }

    const { input } = (await this.promptBuilderService?.buildPrompt(
      DEFAULT_TEXT_MODEL,
      {
        modelCategory: ModelCategory.TEXT,
        prompt: userPrompt,
        promptTemplate: PromptTemplateKey.TEXT_ARTICLE,
        systemPromptTemplate: SystemPromptKey.ARTICLE,
        temperature: 0.8,
      },
      organizationId,
    )) || { input: {} };

    const articleContent =
      await this.replicateService?.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
      );
    if (!articleContent) {
      throw new Error('Failed to generate article content');
    }

    await this.settleDefaultTextCredits(
      organizationId,
      userId,
      input,
      articleContent,
      'Article generation from transcript',
    );

    const titleMatch = articleContent.match(/^#\s+(.+)$/m);
    const title =
      titleMatch?.[1] || transcript.videoTitle || 'Generated Article';
    const summary =
      transcript.transcriptText && typeof transcript.transcriptText === 'string'
        ? transcript.transcriptText.substring(0, 200)
        : '';

    const article = await createArticle(
      {
        category: ArticleCategory.TRANSCRIPT,
        content: articleContent,
        label: title,
        status: ArticleStatus.DRAFT,
        summary,
      } as CreateArticleDto,
      userId,
      organizationId,
      brandId,
    );

    await this.linkTranscriptToArticle(transcriptId, article.id);
    return article;
  }

  private async assertDefaultTextCreditsAvailable(
    organizationId: string,
  ): Promise<void> {
    if (!this.creditsUtilsService || !this.modelsService) {
      return;
    }

    const model = await this.getDefaultTextModel();
    const requiredCredits = getMinimumTextCredits(model);
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );
    if (hasCredits) {
      return;
    }

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    throw new InsufficientCreditsException(requiredCredits, currentBalance);
  }

  private async settleDefaultTextCredits(
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
    output: string,
    description: string,
  ): Promise<void> {
    if (!this.creditsUtilsService || !this.modelsService) {
      return;
    }

    const model = await this.getDefaultTextModel();
    const amount = calculateEstimatedTextCredits(model, input, output);
    if (amount <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      userId,
      amount,
      description,
      ActivitySource.ARTICLE_GENERATION,
      {
        maxOverdraftCredits:
          ArticleTranscriptService.TEXT_MAX_OVERDRAFT_CREDITS,
      },
    );
  }

  private async getDefaultTextModel() {
    const model = await this.modelsService?.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });
    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }
    return model;
  }

  private async getTranscriptById(
    transcriptId: string,
  ): Promise<{ transcriptText?: string; videoTitle?: string } | null> {
    const apiUrl = `${this.configService.get('GENFEEDAI_API_URL')}/transcripts/${transcriptId}`;

    try {
      const response = await fetch(apiUrl);
      const data = (await response.json()) as {
        data?: { transcriptText?: string; videoTitle?: string };
      };
      return data.data || null;
    } catch (error: unknown) {
      this.logger.error('Failed to fetch transcript', error);
      return null;
    }
  }

  private async linkTranscriptToArticle(
    transcriptId: string,
    articleId: string,
  ): Promise<void> {
    const apiUrl = `${this.configService.get('GENFEEDAI_API_URL')}/transcripts/${transcriptId}`;

    try {
      await fetch(apiUrl, {
        body: JSON.stringify({ article: articleId, status: 'completed' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
    } catch (error: unknown) {
      this.logger.error('Failed to link transcript to article', error);
    }
  }
}
