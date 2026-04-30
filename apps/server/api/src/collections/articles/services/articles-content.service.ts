/**
 * Articles Content Service
 * Handles AI-powered content generation and editing:
 * - Generate articles from prompts using AI
 * - Edit existing articles with AI assistance
 * - Convert articles to Twitter threads
 * - Poll generation status
 * - Handle content generation failures
 *
 * This service encapsulates all AI-related content operations
 * to keep the main ArticlesService focused on CRUD operations.
 */
import { TwitterThreadResponse } from '@api/collections/articles/dto/article-to-thread.dto';
import {
  ArticleGenerationType,
  type EditArticleWithAIDto,
  type GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import { type ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigService } from '@api/config/config.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  appendHarnessBriefToPrompt,
  buildHarnessInput,
  buildPromptBuilderBrandContext,
} from '@api/services/harness/harness-brief.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ArticleCategory,
  ArticleStatus,
  AssetScope,
  ModelCategory,
  PromptCategory,
  PromptStatus,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import type {
  ArticleCreatePayload,
  ArticleGenerationResponse,
  GeneratedArticleData,
} from '@genfeedai/interfaces/content/article.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';

export interface ArticleCycleModelConfig {
  generationModel?: string;
  reviewModel?: string;
  updateModel?: string;
}

export interface ArticleReviewRubric {
  score: number;
  strengths: string[];
  issues: Array<{
    severity: 'low' | 'medium' | 'high';
    category: string;
    message: string;
    recommendation: string;
  }>;
  revisionInstructions: string;
  summary: string;
}

export interface TextGenerationCharge {
  amount: number;
  inputTokens: number;
  modelKey: string;
  outputTokens: number;
}

interface ArticleHarnessContext {
  brief?: ContentHarnessBrief;
  promptBuilder: Pick<
    PromptBuilderParams,
    'brand' | 'branding' | 'brandingMode' | 'isBrandingEnabled'
  >;
}

type HarnessPersonaInput = Parameters<typeof buildHarnessInput>[0]['persona'];

@Injectable()
export class ArticlesContentService {
  private readonly constructorName = this.constructor.name;
  private readonly defaultArticleLabel = 'Untitled Article';

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,

    @Optional() private readonly modelsService?: ModelsService,
    @Optional() private readonly promptsService?: PromptsService,
    @Optional()
    @Inject(forwardRef(() => require('./articles.service').ArticlesService))
    private readonly articlesService?: ArticlesService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly templatesService?: TemplatesService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
    @Optional() private readonly brandsService?: BrandsService,
    @Optional() private readonly personasService?: PersonasService,
    @Optional() private readonly contentHarnessService?: ContentHarnessService,
    @Optional()
    private readonly harnessProfilesService?: HarnessProfilesService,
  ) {}

  /**
   * Generate articles using OpenAI assistant - ASYNC pattern (like video generation)
   * Creates article placeholders immediately with PROCESSING status, then updates via polling
   */
  async generateArticles(
    generateDto: GenerateArticlesDto,
    userId: string,
    organizationId: string,
    brandId: string,
    modelConfig: ArticleCycleModelConfig,
    createArticleFn: (
      articleData: ArticleCreatePayload,
      userId: string,
      organizationId: string,
      brandId: string,
    ) => Promise<ArticleDocument>,
    onBilling?: (charge: TextGenerationCharge) => void,
  ): Promise<ArticleDocument[]> {
    try {
      this.logger.debug(`${this.constructorName} generateArticles`, {
        generateDto,
      });

      if (!this.replicateService) {
        throw new Error('OpenAI service not available');
      }

      if (!this.configService) {
        throw new Error('Config service not available');
      }

      // Get prompt template from database
      const prompt = await this.templatesService?.getRenderedPrompt(
        PromptTemplateKey.ARTICLE_GENERATE,
        {
          category: generateDto.category || '',
          count: generateDto.count || 1,
          keywords: generateDto.keywords?.join(', ') || '',
          prompt: generateDto.prompt,
        },
        organizationId,
      );

      if (!prompt) {
        throw new Error('Template service not available');
      }

      // Update usage metadata
      await this.templatesService?.updateMetadata(
        PromptTemplateKey.ARTICLE_GENERATE,
        { incrementUsage: true },
      );

      this.logger.log('Article generation started', {
        count: generateDto.count || 1,
        prompt: generateDto.prompt.substring(0, 50),
      });

      const harnessContext = await this.buildArticleHarnessContext({
        brandId,
        contentType: 'article',
        objective: 'authority',
        organizationId,
        sourceLines: [
          ...(generateDto.keywords?.map((keyword) => `keyword: ${keyword}`) ??
            []),
          ...(generateDto.tone ? [`tone: ${generateDto.tone}`] : []),
        ],
        topic: generateDto.prompt,
      });
      const promptWithHarness = appendHarnessBriefToPrompt(
        prompt,
        harnessContext.brief,
      );

      // Build prompt with PromptBuilderService then call Replicate
      const generationModel = modelConfig.generationModel || DEFAULT_TEXT_MODEL;
      const { input } = (await this.promptBuilderService?.buildPrompt(
        generationModel as string,
        {
          maxTokens: this.configService.get('MAX_TOKENS'),
          modelCategory: ModelCategory.TEXT,
          prompt: promptWithHarness,
          promptTemplate: PromptTemplateKey.TEXT_ARTICLE,
          systemPromptTemplate: SystemPromptKey.ARTICLE,
          temperature: 0.8,
          ...harnessContext.promptBuilder,
        },
        organizationId,
      )) || { input: {} };

      const responseText =
        await this.replicateService?.generateTextCompletionSync(
          generationModel,
          input,
        );

      if (!responseText) {
        throw new Error('Failed to generate content from AI service');
      }

      onBilling?.(
        await this.calculateTextGenerationCharge(
          generationModel,
          input,
          responseText,
        ),
      );

      // Parse JSON response
      let response: ArticleGenerationResponse;
      try {
        response = JSON.parse(responseText) as ArticleGenerationResponse;
      } catch (parseError) {
        this.logger.error('Failed to parse article generation JSON', {
          parseError,
          responseText: responseText.substring(0, 500),
        });
        throw new Error('Invalid JSON response from AI service');
      }

      // Handle both single article and array formats
      let generatedArticles: GeneratedArticleData[];
      if (response?.articles && Array.isArray(response.articles)) {
        generatedArticles = response.articles;
      } else if (response?.slug || response?.title || response?.label) {
        // Single article format
        generatedArticles = [response as GeneratedArticleData];
      } else {
        throw new Error('Unexpected response format from AI service');
      }

      const count = generateDto.count || 1;
      const category = generateDto.category || ArticleCategory.POST;
      const createdArticles: ArticleDocument[] = [];

      // Create articles from generated content
      for (let i = 0; i < Math.min(count, generatedArticles.length); i++) {
        const generated = generatedArticles[i];
        const draft = {
          content: generated.content || '',
          label:
            generated.label || generated.title || `Generated Article ${i + 1}`,
          summary: generated.summary || '',
        };
        const cycle = await this.runReviewUpdateCycle({
          draft,
          harnessContext,
          modelConfig,
          onBilling,
          organizationId,
          prompt: generateDto.prompt,
          type: ArticleGenerationType.STANDARD,
        });
        const articlePayload: ArticleCreatePayload = {
          aiGeneration: {
            completedAt: new Date(),
            prompt: generateDto.prompt,
            startedAt: new Date(),
          },
          category,
          content: cycle.updated.content,
          label: cycle.updated.label,
          slug: generated.slug || `article-${Date.now()}-${i}`,
          status: ArticleStatus.DRAFT,
          summary: cycle.updated.summary,
          tags: generated.tags || [],
        };

        const article = await createArticleFn(
          articlePayload,
          userId,
          organizationId,
          brandId,
        );

        createdArticles.push(article);
      }

      this.logger.log(
        `${this.constructorName} generation complete, created ${createdArticles.length} articles`,
        { count: createdArticles.length },
      );

      return createdArticles;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} generateArticles failed`, {
        error,
        generateDto,
      });
      throw error;
    }
  }

  /**
   * Generate a long-form X Article using AI
   * Creates a single structured article with sections, pull quotes, and metadata
   */
  async generateLongFormArticle(
    generateDto: GenerateArticlesDto,
    userId: string,
    organizationId: string,
    brandId: string,
    modelConfig: ArticleCycleModelConfig,
    createArticleFn: (
      articleData: ArticleCreatePayload,
      userId: string,
      organizationId: string,
      brandId: string,
    ) => Promise<ArticleDocument>,
    onBilling?: (charge: TextGenerationCharge) => void,
  ): Promise<ArticleDocument> {
    try {
      this.logger.debug(`${this.constructorName} generateLongFormArticle`, {
        generateDto,
      });

      if (!this.replicateService) {
        throw new Error('OpenAI service not available');
      }

      if (!this.configService) {
        throw new Error('Config service not available');
      }

      // Get prompt template from database
      const prompt = await this.templatesService?.getRenderedPrompt(
        PromptTemplateKey.X_ARTICLE_GENERATE,
        {
          keywords: generateDto.keywords?.join(', ') || '',
          prompt: generateDto.prompt,
          targetWordCount: generateDto.targetWordCount || 5000,
          tone: generateDto.tone || 'authoritative',
        },
        organizationId,
      );

      if (!prompt) {
        throw new Error('Template service not available');
      }

      // Update usage metadata
      await this.templatesService?.updateMetadata(
        PromptTemplateKey.X_ARTICLE_GENERATE,
        { incrementUsage: true },
      );

      this.logger.log('X Article generation started', {
        prompt: generateDto.prompt.substring(0, 50),
        targetWordCount: generateDto.targetWordCount || 5000,
      });

      const harnessContext = await this.buildArticleHarnessContext({
        brandId,
        contentType: 'article',
        objective: 'authority',
        organizationId,
        sourceLines: [
          ...(generateDto.keywords?.map((keyword) => `keyword: ${keyword}`) ??
            []),
          ...(generateDto.tone ? [`tone: ${generateDto.tone}`] : []),
          `targetWordCount: ${generateDto.targetWordCount || 5000}`,
        ],
        topic: generateDto.prompt,
      });
      const promptWithHarness = appendHarnessBriefToPrompt(
        prompt,
        harnessContext.brief,
      );

      // Build prompt with PromptBuilderService then call Replicate
      const generationModel = modelConfig.generationModel || DEFAULT_TEXT_MODEL;
      const { input } = (await this.promptBuilderService?.buildPrompt(
        generationModel as string,
        {
          maxTokens: this.configService.get('MAX_TOKENS'),
          modelCategory: ModelCategory.TEXT,
          prompt: promptWithHarness,
          promptTemplate: PromptTemplateKey.X_ARTICLE_GENERATE,
          systemPromptTemplate: SystemPromptKey.X_ARTICLE,
          temperature: 0.8,
          ...harnessContext.promptBuilder,
        },
        organizationId,
      )) || { input: {} };

      const responseText =
        await this.replicateService?.generateTextCompletionSync(
          generationModel,
          input,
        );

      if (!responseText) {
        throw new Error('Failed to generate content from AI service');
      }

      onBilling?.(
        await this.calculateTextGenerationCharge(
          generationModel,
          input,
          responseText,
        ),
      );

      // Parse JSON response
      let response: ArticleGenerationResponse;
      try {
        response = JSON.parse(responseText) as ArticleGenerationResponse;
      } catch (parseError) {
        this.logger.error('Failed to parse X Article generation JSON', {
          parseError,
          responseText: responseText.substring(0, 500),
        });
        throw new Error('Invalid JSON response from AI service');
      }

      // Validate expected structure
      if (
        !response?.title ||
        !response?.sections ||
        !Array.isArray(response.sections)
      ) {
        throw new Error('Unexpected response format from AI service');
      }

      // Build full HTML content by concatenating sections
      const htmlParts: string[] = [];
      for (const section of response.sections) {
        if (section.heading) {
          htmlParts.push(`<h2>${section.heading}</h2>`);
        }
        if (section.content) {
          htmlParts.push(section.content);
        }
        if (section.pullQuote) {
          htmlParts.push(`<blockquote>${section.pullQuote}</blockquote>`);
        }
      }
      const fullContent = htmlParts.join('\n');

      // Calculate word count and estimated read time
      const plainText = fullContent.replace(/<[^>]+>/g, '');
      const wordCount = plainText.split(/\s+/).filter(Boolean).length;
      const estimatedReadTime = Math.ceil(wordCount / 250);

      // Build xArticleMetadata
      const xArticleMetadata = {
        estimatedReadTime,
        sections: response.sections.map((s, index) => ({
          content: s.content || '',
          heading: s.heading || '',
          id: `section-${index + 1}`,
          order: index + 1,
          pullQuote: s.pullQuote,
        })),
        wordCount,
      };

      const cycle = await this.runReviewUpdateCycle({
        draft: {
          content: fullContent,
          label: response.title,
          summary: response.summary || '',
        },
        harnessContext,
        modelConfig,
        onBilling,
        organizationId,
        prompt: generateDto.prompt,
        type: ArticleGenerationType.X_ARTICLE,
      });

      const articlePayload: ArticleCreatePayload = {
        aiGeneration: {
          completedAt: new Date(),
          prompt: generateDto.prompt,
          startedAt: new Date(),
        },
        category: ArticleCategory.X_ARTICLE,
        content: cycle.updated.content,
        label: cycle.updated.label,
        slug: response.slug || `x-article-${Date.now()}`,
        status: ArticleStatus.DRAFT,
        summary: cycle.updated.summary,
        tags: response.tags || [],
        xArticleMetadata,
      };

      const article = await createArticleFn(
        articlePayload,
        userId,
        organizationId,
        brandId,
      );

      this.logger.log(`${this.constructorName} X Article generation complete`, {
        articleId: article._id,
        wordCount,
      });

      return article;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} generateLongFormArticle failed`,
        {
          error,
          generateDto,
        },
      );
      throw error;
    }
  }

  /**
   * Edit existing article using AI with version tracking
   * Returns immediately with PROCESSING status, updates via websocket when complete
   *
   * @param templateKey - Template to use for enhancement (default: ARTICLE_EDIT, use ARTICLE_SEO for SEO optimization)
   */
  async enhance(
    article: ArticleDocument,
    editDto: EditArticleWithAIDto,
    userId: string,
    organizationId: string,
    brandId: string,
    templateKey: PromptTemplateKey = PromptTemplateKey.ARTICLE_EDIT,
  ): Promise<ArticleDocument> {
    try {
      this.logger.debug(`${this.constructorName} enhance`, {
        articleId: article._id,
        prompt: editDto.prompt,
        templateKey,
      });

      if (!this.replicateService) {
        throw new Error('OpenAI service not available');
      }

      // Get prompt template from database
      const prompt = await this.templatesService?.getRenderedPrompt(
        templateKey,
        {
          content: article.content,
          summary: article.summary,
          title: article.label,
          userRequest: editDto.prompt,
        },
        organizationId,
      );

      if (!prompt) {
        throw new Error('Template service not available');
      }

      // Update usage metadata
      await this.templatesService?.updateMetadata(templateKey, {
        incrementUsage: true,
      });

      this.logger.log('Article enhancement started', {
        articleId: article._id,
        prompt: editDto.prompt.substring(0, 50),
      });

      const harnessContext = await this.buildArticleHarnessContext({
        brandId,
        contentType: 'article',
        objective: 'authority',
        organizationId,
        sourceLines: [`enhancement-request: ${editDto.prompt}`],
        topic: this.getArticleLabel(article),
      });
      const promptWithHarness = appendHarnessBriefToPrompt(
        prompt,
        harnessContext.brief,
      );

      // Build prompt with PromptBuilderService then call Replicate
      const { input: enhanceInput } =
        (await this.promptBuilderService?.buildPrompt(
          DEFAULT_MINI_TEXT_MODEL,
          {
            maxTokens: TEXT_GENERATION_LIMITS.articleEnhancement,
            modelCategory: ModelCategory.TEXT,
            prompt: promptWithHarness,
            systemPromptTemplate: SystemPromptKey.ARTICLE,
            temperature: 0.8,
            useTemplate: false,
            ...harnessContext.promptBuilder,
          },
          organizationId,
        )) || { input: {} };

      const responseText =
        await this.replicateService?.generateTextCompletionSync(
          DEFAULT_MINI_TEXT_MODEL,
          enhanceInput,
        );

      if (!responseText) {
        throw new Error('Failed to enhance content from AI service');
      }

      // Parse JSON response
      let response: ArticleGenerationResponse;
      try {
        response = JSON.parse(responseText) as ArticleGenerationResponse;
      } catch (_parseError) {
        // If not JSON, treat as plain text content
        this.logger.debug('Response is not JSON, treating as plain text');
        response = { content: responseText };
      }

      // Update article with enhanced content
      await this.updateArticleWithEnhancedContent(
        article,
        response,
        prompt,
        undefined, // assistantId no longer needed
        userId,
        organizationId,
        brandId,
      );

      // Fetch and return updated article
      const updatedArticle = await this.articlesService?.findOne({
        _id: article._id,
      });
      if (!updatedArticle) {
        throw new Error('Article not found after enhancement');
      }

      this.logger.log(`${this.constructorName} enhancement complete`, {
        articleId: article._id,
      });

      return updatedArticle;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} enhance failed`, {
        articleId: article._id,
        error,
      });
      throw error;
    }
  }

  /**
   * Convert article to Twitter thread
   */
  convertToTwitterThread(
    article: ArticleDocument,
  ): Promise<TwitterThreadResponse> {
    try {
      this.logger.debug(`${this.constructorName} convertToTwitterThread`, {
        articleId: article._id,
      });

      // Parse HTML content to extract paragraphs
      const articleContent = article.content ?? '';
      const articleLabel = this.getArticleLabel(article);
      const articleSummary = article.summary ?? '';
      const content = articleContent
        .replace(/<[^>]+>/g, '') // Strip HTML tags
        .replace(/\n+/g, '\n') // Normalize newlines
        .trim();

      // Split by double newlines (paragraphs) or by sentences if no paragraphs
      const paragraphs = content
        .split(/\n\n+/)
        .filter((p) => p.trim().length > 0);

      const tweets: TwitterThreadResponse['tweets'] = [];
      const maxChars = 280;

      // First tweet: Title + summary
      const firstTweet = articleSummary
        ? `${articleLabel}\n\n${articleSummary}`
        : articleLabel;
      if (firstTweet.length <= maxChars) {
        tweets.push({
          characterCount: firstTweet.length,
          content: firstTweet,
          order: 1,
        });
      } else {
        // Title only if too long
        tweets.push({
          characterCount: articleLabel.length,
          content: articleLabel,
          order: 1,
        });
      }

      // Convert each paragraph to a tweet
      paragraphs.forEach((paragraph) => {
        const trimmed = paragraph.trim();

        if (trimmed.length === 0) {
          return;
        }

        if (trimmed.length <= maxChars) {
          // Paragraph fits in one tweet
          tweets.push({
            characterCount: trimmed.length,
            content: trimmed,
            order: tweets.length + 1,
          });
        } else {
          // Split long paragraph by sentences
          const sentences = trimmed.split(/(?<=[.!?])\s+/);
          let currentTweet = '';

          sentences.forEach((sentence) => {
            if (`${currentTweet} ${sentence}`.trim().length <= maxChars) {
              currentTweet += (currentTweet ? ' ' : '') + sentence;
            } else {
              if (currentTweet) {
                tweets.push({
                  characterCount: currentTweet.trim().length,
                  content: currentTweet.trim(),
                  order: tweets.length + 1,
                });
              }
              currentTweet = sentence;
            }
          });

          if (currentTweet.trim()) {
            tweets.push({
              characterCount: currentTweet.trim().length,
              content: currentTweet.trim(),
              order: tweets.length + 1,
            });
          }
        }
      });

      // Add final tweet with link (if article has a slug)
      if (article.slug && this.configService) {
        const baseUrl = `${this.configService.get('GENFEEDAI_PUBLIC_URL')}/articles/${article.slug}`;
        const articleUrl =
          String(article.status) === ArticleStatus.PUBLIC
            ? baseUrl
            : `${baseUrl}?isPreview=true`;
        const finalTweet = `Read the full article:\n${articleUrl}`;

        if (finalTweet.length <= maxChars) {
          tweets.push({
            characterCount: finalTweet.length,
            content: finalTweet,
            order: tweets.length + 1,
          });
        }
      }

      this.logger.log(
        `${this.constructorName} converted article to ${tweets.length} tweets`,
        { articleId: article._id, totalTweets: tweets.length },
      );

      return Promise.resolve({
        totalTweets: tweets.length,
        tweets,
      } as TwitterThreadResponse);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} convertToTwitterThread failed`,
        {
          articleId: article._id,
          error,
        },
      );
      throw error;
    }
  }

  private async buildArticleHarnessContext(params: {
    brandId?: string;
    contentType: 'article';
    objective: 'authority';
    organizationId: string;
    sourceLines?: string[];
    topic: string;
  }): Promise<ArticleHarnessContext> {
    if (
      !params.brandId ||
      !this.brandsService ||
      !this.contentHarnessService ||
      !this.personasService
    ) {
      return { promptBuilder: {} };
    }

    const brand = await this.brandsService.findOne(
      {
        id: params.brandId,
        isDeleted: false,
        organizationId: params.organizationId,
      },
      'none',
    );

    if (!brand) {
      return { promptBuilder: {} };
    }

    const persona = await this.personasService.findOne({
      brandId: params.brandId,
      isDeleted: false,
      organizationId: params.organizationId,
    });
    const harnessPersona = this.normalizeHarnessPersona(persona);
    const profileContribution =
      await this.harnessProfilesService?.buildContributionForBrand(
        params.organizationId,
        params.brandId,
      );

    const brief = await this.contentHarnessService.composeBrief(
      buildHarnessInput({
        additionalSources:
          params.sourceLines?.map((content, index) => ({
            content,
            id: `article-context-${index}`,
            kind: 'audience_signal',
          })) ?? [],
        brand,
        intent: {
          contentType: params.contentType,
          objective: params.objective,
          topic: params.topic,
        },
        organizationId: params.organizationId,
        persona: harnessPersona,
        profileContribution: profileContribution ?? undefined,
      }),
    );

    return {
      brief,
      promptBuilder: buildPromptBuilderBrandContext({
        brand,
        persona: harnessPersona,
      }),
    };
  }

  async reviewExistingArticle(
    article: ArticleDocument,
    organizationId: string,
    modelConfig: ArticleCycleModelConfig,
    focus?: string,
    onBilling?: (charge: TextGenerationCharge) => void,
  ): Promise<ArticleReviewRubric> {
    const harnessContext = await this.buildArticleHarnessContext({
      brandId: article.brand?.toString?.(),
      contentType: 'article',
      objective: 'authority',
      organizationId,
      sourceLines: focus ? [`review-focus: ${focus}`] : [],
      topic: this.getArticleLabel(article),
    });
    const reviewModel = modelConfig.reviewModel || DEFAULT_MINI_TEXT_MODEL;
    const reviewPrompt = this.buildReviewPrompt({
      content: article.content ?? '',
      focus,
      harnessBrief: harnessContext.brief,
      label: this.getArticleLabel(article),
      summary: article.summary || '',
      type:
        article.category === ArticleCategory.X_ARTICLE
          ? ArticleGenerationType.X_ARTICLE
          : ArticleGenerationType.STANDARD,
    });

    const { output: reviewRaw, charge } = await this.generateTextWithModel(
      reviewModel,
      reviewPrompt,
      organizationId,
      harnessContext.promptBuilder,
    );
    onBilling?.(charge);

    return this.parseReviewRubric(reviewRaw);
  }

  private async runReviewUpdateCycle(params: {
    draft: { label: string; summary: string; content: string };
    harnessContext?: ArticleHarnessContext;
    prompt: string;
    organizationId: string;
    modelConfig: ArticleCycleModelConfig;
    type: ArticleGenerationType;
    onBilling?: (charge: TextGenerationCharge) => void;
  }): Promise<{
    review: ArticleReviewRubric;
    updated: { label: string; summary: string; content: string };
  }> {
    const reviewModel =
      params.modelConfig.reviewModel || DEFAULT_MINI_TEXT_MODEL;
    const updateModel =
      params.modelConfig.updateModel || DEFAULT_MINI_TEXT_MODEL;

    const { output: reviewRaw, charge: reviewCharge } =
      await this.generateTextWithModel(
        reviewModel,
        this.buildReviewPrompt({
          content: params.draft.content,
          harnessBrief: params.harnessContext?.brief,
          label: params.draft.label,
          summary: params.draft.summary,
          type: params.type,
        }),
        params.organizationId,
        params.harnessContext?.promptBuilder,
      );
    params.onBilling?.(reviewCharge);
    const review = this.parseReviewRubric(reviewRaw);

    const { output: revisionRaw, charge: revisionCharge } =
      await this.generateTextWithModel(
        updateModel,
        this.buildRevisionPrompt(
          params.draft,
          params.prompt,
          review,
          params.type,
          params.harnessContext?.brief,
        ),
        params.organizationId,
        params.harnessContext?.promptBuilder,
      );
    params.onBilling?.(revisionCharge);
    const updated = this.parseUpdatedArticle(revisionRaw, params.draft);

    return { review, updated };
  }

  private async generateTextWithModel(
    model: string,
    prompt: string,
    organizationId: string,
    promptBuilderContext?: Pick<
      PromptBuilderParams,
      'brand' | 'branding' | 'brandingMode' | 'isBrandingEnabled'
    >,
  ): Promise<{ output: string; charge: TextGenerationCharge }> {
    const { input } = (await this.promptBuilderService?.buildPrompt(
      model as string,
      {
        maxTokens: this.configService.get('MAX_TOKENS'),
        modelCategory: ModelCategory.TEXT,
        prompt,
        systemPromptTemplate: SystemPromptKey.ARTICLE,
        temperature: 0.7,
        useTemplate: false,
        ...promptBuilderContext,
      },
      organizationId,
    )) || { input: {} };

    const output = await this.replicateService?.generateTextCompletionSync(
      model,
      input,
    );

    if (!output) {
      throw new Error(`Failed to generate text with model: ${model}`);
    }

    return {
      charge: await this.calculateTextGenerationCharge(model, input, output),
      output,
    };
  }

  private async calculateTextGenerationCharge(
    modelKey: string,
    input: unknown,
    output: string,
  ): Promise<TextGenerationCharge> {
    if (!this.modelsService) {
      throw new Error('ModelsService not available');
    }

    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(modelKey),
    });

    if (!model) {
      throw new Error(`Model pricing is not configured for ${modelKey}`);
    }

    const inputTokens = this.estimateTokens(input);
    const outputTokens = this.estimateTokens(output);

    const amount =
      model.pricingType === 'per-token'
        ? Math.max(
            Math.ceil(
              (inputTokens * Number(model.inputCostPerMillionTokens || 0) +
                outputTokens * Number(model.outputCostPerMillionTokens || 0)) /
                1_000_000,
            ),
            getMinimumTextCredits(model),
          )
        : model.cost || 0;

    return {
      amount,
      inputTokens,
      modelKey,
      outputTokens,
    };
  }

  private estimateTokens(value: unknown): number {
    const text = this.extractBillableText(value).trim();

    if (!text) {
      return 0;
    }

    return Math.ceil(text.length / 4);
  }

  private extractBillableText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.extractBillableText(item)).join(' ');
    }

    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .map((item) => this.extractBillableText(item))
        .join(' ');
    }

    return '';
  }

  private getArticleLabel(article: Pick<ArticleDocument, 'label'>): string {
    const label = article.label?.trim();

    return label ? label : this.defaultArticleLabel;
  }

  private normalizeHarnessPersona(
    persona: PersonaDocument | null | undefined,
  ): HarnessPersonaInput {
    if (!persona) {
      return null;
    }

    const personaRecord = persona as Record<string, unknown>;
    const normalizedPersona: NonNullable<HarnessPersonaInput> = {
      bio:
        typeof personaRecord.bio === 'string' ? personaRecord.bio : undefined,
      contentStrategy:
        personaRecord.contentStrategy as NonNullable<HarnessPersonaInput>['contentStrategy'],
      darkroomSources: Array.isArray(personaRecord.darkroomSources)
        ? (personaRecord.darkroomSources as NonNullable<HarnessPersonaInput>['darkroomSources'])
        : undefined,
      handle:
        typeof personaRecord.handle === 'string'
          ? personaRecord.handle
          : undefined,
      label: persona.label,
    };

    return normalizedPersona;
  }

  private buildReviewPrompt(input: {
    label: string;
    summary: string;
    content: string;
    type: ArticleGenerationType;
    focus?: string;
    harnessBrief?: ContentHarnessBrief;
  }): string {
    const typeLabel =
      input.type === ArticleGenerationType.X_ARTICLE
        ? 'X long-form article'
        : 'standard article';
    const focusLine = input.focus ? `Focus area: ${input.focus}` : '';

    return appendHarnessBriefToPrompt(
      `You are an expert content reviewer. Review this ${typeLabel} and return strict JSON only.

${focusLine}

TITLE:
${input.label}

SUMMARY:
${input.summary}

CONTENT:
${input.content}

Return this exact JSON shape:
{
  "score": 0,
  "summary": "One paragraph overview",
  "strengths": ["..."],
  "issues": [
    {
      "severity": "low|medium|high",
      "category": "clarity|structure|tone|seo|accuracy|cta",
      "message": "...",
      "recommendation": "..."
    }
  ],
  "revisionInstructions": "Concrete instructions to improve the draft in one pass"
}`,
      input.harnessBrief,
    );
  }

  private buildRevisionPrompt(
    draft: { label: string; summary: string; content: string },
    originalPrompt: string,
    review: ArticleReviewRubric,
    type: ArticleGenerationType,
    harnessBrief?: ContentHarnessBrief,
  ): string {
    const typeLine =
      type === ArticleGenerationType.X_ARTICLE
        ? 'Keep X article style and section depth.'
        : 'Keep standard article/blog style.';
    return appendHarnessBriefToPrompt(
      `You are an expert content editor. Improve the draft using the review feedback.

Original request:
${originalPrompt}

${typeLine}

Current draft:
Title: ${draft.label}
Summary: ${draft.summary}
Content:
${draft.content}

Review summary:
${review.summary}
Score: ${review.score}
Revision instructions:
${review.revisionInstructions}

Issues:
${review.issues
  .map(
    (issue, index) =>
      `${index + 1}. [${issue.severity}] ${issue.category}: ${issue.message} -> ${issue.recommendation}`,
  )
  .join('\n')}

Return strict JSON only:
{
  "label": "Improved title",
  "summary": "Improved summary",
  "content": "Improved content (HTML allowed)"
}`,
      harnessBrief,
    );
  }

  private parseReviewRubric(raw: string): ArticleReviewRubric {
    try {
      const parsed = JSON.parse(raw) as Partial<ArticleReviewRubric>;
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues
            .map((issue) => ({
              category: String(issue.category || 'clarity'),
              message: String(issue.message || ''),
              recommendation: String(issue.recommendation || ''),
              severity:
                issue.severity === 'high' ||
                issue.severity === 'medium' ||
                issue.severity === 'low'
                  ? issue.severity
                  : 'medium',
            }))
            .filter((issue) => issue.message.length > 0)
        : [];

      return {
        issues,
        revisionInstructions: String(parsed.revisionInstructions || ''),
        score:
          typeof parsed.score === 'number' && Number.isFinite(parsed.score)
            ? Math.max(0, Math.min(100, parsed.score))
            : 70,
        strengths: Array.isArray(parsed.strengths)
          ? parsed.strengths
              .map((item) => String(item))
              .filter((item) => item.length > 0)
          : [],
        summary: String(parsed.summary || ''),
      };
    } catch {
      return {
        issues: [],
        revisionInstructions:
          'Improve clarity, structure, and call to action while preserving intent.',
        score: 70,
        strengths: [],
        summary:
          'Review model returned unstructured output, using fallback rubric.',
      };
    }
  }

  private parseUpdatedArticle(
    raw: string,
    fallback: { label: string; summary: string; content: string },
  ): { label: string; summary: string; content: string } {
    try {
      const parsed = JSON.parse(raw) as Partial<{
        label: string;
        summary: string;
        content: string;
      }>;
      return {
        content: String(parsed.content || fallback.content),
        label: String(parsed.label || fallback.label),
        summary: String(parsed.summary || fallback.summary),
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Update article with enhanced content from OpenAI response
   */
  private async updateArticleWithEnhancedContent(
    article: ArticleDocument,
    response: ArticleGenerationResponse,
    prompt: string,
    _assistantId: string | undefined,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    try {
      // Extract article data from response
      // Response can be: { articles: [...] } or direct article object with { label, summary, content }
      let articleData: GeneratedArticleData;
      if (
        response.articles &&
        Array.isArray(response.articles) &&
        response.articles.length > 0
      ) {
        articleData = response.articles[0];
      } else if (response.label || response.content || response.summary) {
        // Direct article format
        articleData = response as GeneratedArticleData;
      } else {
        this.logger.error('Invalid response format from OpenAI assistant', {
          hasArticles: !!response.articles,
          isArray: Array.isArray(response.articles),
          responseKeys: Object.keys(response),
        });
        throw new Error('Invalid response format from AI assistant');
      }

      // Assistant returns ONLY changed fields - build update data accordingly
      const updateData: Record<string, unknown> = {
        'aiGeneration.completedAt': new Date(),
        status: ArticleStatus.DRAFT,
      };

      if (articleData.label) {
        updateData.label = articleData.label.substring(0, 200);
      }

      if (articleData.summary) {
        updateData.summary = articleData.summary.substring(0, 500);
      }

      if (articleData.content) {
        updateData.content = articleData.content;
      }

      if (articleData.slug) {
        // Ensure slug is unique if being changed
        let slug = articleData.slug
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .trim();

        if (slug !== article.slug) {
          let counter = 1;
          while (await this.slugExists(slug, organizationId, brandId)) {
            slug = `${articleData.slug}-${counter}`;
            counter++;
          }
          updateData.slug = slug;
        }
      }

      // Update article
      await this.articlesService?.patch(article._id, updateData);

      // Create a prompt record to track this edit
      if (this.promptsService) {
        await this.promptsService.create(
          new PromptEntity({
            articleId: String(
              (article as Record<string, unknown>).id ?? article._id,
            ),
            brandId: brandId,
            category: PromptCategory.ARTICLE,
            enhanced: JSON.stringify(response),
            isDeleted: false,
            isFavorite: false,
            isSkipEnhancement: false,
            organizationId: organizationId,
            original: prompt,
            scope: AssetScope.USER,
            status: PromptStatus.GENERATED,
            userId: userId,
          }),
        );
      }

      // Publish websocket event for article completion
      if (this.websocketService) {
        await this.websocketService.publishArticleStatus(
          article._id.toString(),
          'completed',
          userId,
          {
            content: updateData.content || article.content,
            label: updateData.label || article.label,
            slug: updateData.slug || article.slug,
            summary: updateData.summary || article.summary,
          },
        );
      }

      this.logger.log(`${this.constructorName} enhanced article with AI`, {
        articleId: article._id,
        prompt,
      });
    } catch (error: unknown) {
      this.logger.error('Failed to update article with enhanced content', {
        articleId: article._id,
        error: {
          message: (error as Error)?.message || 'Unknown error',
          stack: (error as Error)?.stack,
        },
      });
      await this.markArticleAsFailed(
        article,
        (error as Error)?.message || 'Failed to process enhanced content',
        userId,
      );
    }
  }

  /**
   * Mark article as failed during enhancement
   */
  private async markArticleAsFailed(
    article: ArticleDocument,
    errorMessage: string,
    userId: string,
  ): Promise<void> {
    await this.articlesService?.patch(
      ((article as Record<string, unknown>).id as string) ??
        String(article._id),
      {
        aiGenerationCompletedAt: new Date(),
        aiGenerationError: errorMessage,
        status: ArticleStatus.DRAFT,
      } as unknown as Partial<UpdateArticleDto>,
    );

    // Publish websocket event for article failure
    if (this.websocketService) {
      await this.websocketService.publishArticleStatus(
        article._id.toString(),
        'failed',
        userId,
        {
          error: errorMessage,
        },
      );
    }

    this.logger.error('Article enhancement failed', {
      articleId: article._id,
      error: errorMessage,
    });
  }

  /**
   * Check if slug exists for the organization/brand
   */
  private async slugExists(
    slug: string,
    organizationId: string,
    brandId: string,
  ): Promise<boolean> {
    const existing = await this.articlesService?.findOne({
      brandId: brandId,
      isDeleted: false,
      organizationId: organizationId,
      slug,
    });

    return !!existing;
  }
}
