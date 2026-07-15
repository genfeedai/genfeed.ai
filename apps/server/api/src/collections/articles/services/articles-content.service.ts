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
import { type ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleContentPersistenceService } from '@api/collections/articles/services/article-content-persistence.service';
import { ArticleReviewService } from '@api/collections/articles/services/article-review.service';
import { ArticleTextGenerationService } from '@api/collections/articles/services/article-text-generation.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type {
  ArticleCycleModelConfig,
  ArticleHarnessContext,
  ArticleReviewRubric,
  TextGenerationCharge,
  XArticleContentMetadata,
} from '@api/collections/articles/services/articles-content.types';
import { buildTwitterThreadTweets } from '@api/collections/articles/utils/article-thread.util';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  buildHarnessInput,
  buildPromptBuilderBrandContext,
} from '@api/services/harness/harness-brief.util';
import {
  ArticleCategory,
  ArticleStatus,
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { AccountPublishingContext } from '@genfeedai/interfaces';
import type {
  ArticleCreatePayload,
  ArticleGenerationResponse,
  GeneratedArticleData,
} from '@genfeedai/interfaces/content/article.interface';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

export type {
  ArticleCycleModelConfig,
  ArticleReviewRubric,
} from '@api/collections/articles/services/articles-content.types';

type HarnessPersonaInput = Parameters<typeof buildHarnessInput>[0]['persona'];

@Injectable()
export class ArticlesContentService {
  private readonly constructorName = this.constructor.name;
  private readonly defaultArticleLabel = 'Untitled Article';

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    private readonly articleTextGenerationService: ArticleTextGenerationService,
    private readonly articleReviewService: ArticleReviewService,
    private readonly articleContentPersistenceService: ArticleContentPersistenceService,

    @Optional() private readonly templatesService?: TemplatesService,
    @Optional() private readonly brandsService?: BrandsService,
    @Optional() private readonly personasService?: PersonasService,
    @Optional() private readonly contentHarnessService?: ContentHarnessService,
    @Optional()
    private readonly harnessProfilesService?: HarnessProfilesService,
    @Optional()
    private readonly accountPublishingContextService?: AccountPublishingContextService,
    @Optional() private readonly replicateService?: ReplicateService,
  ) {}

  /**
   * Lazily resolve ArticlesService to break the module-init circular dependency
   * with articles.service. Resolving via ModuleRef at call time (instead of
   * constructor injection) keeps ArticlesService out of the emitted
   * `design:paramtypes` metadata, which otherwise references the class before
   * it is initialized under ESM (TDZ crash at boot). `strict: false` searches
   * the whole app context; missing provider yields undefined to preserve the
   * previous `@Optional()` behavior.
   */
  private get articlesService(): ArticlesService | undefined {
    try {
      return this.moduleRef.get(ArticlesService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private appendAccountPublishingContextToPrompt(
    prompt: string,
    context?: AccountPublishingContext,
  ): string {
    if (!context) {
      return prompt;
    }

    return [
      prompt,
      '',
      'Account publishing context:',
      ...context.promptHints.map((hint) => `- ${hint}`),
      ...context.constraints.notes.map((note) => `- ${note}`),
      '',
      'Write this as a copy-ready X Article for the selected account. Do not mention that Genfeed cannot publish it.',
    ].join('\n');
  }

  private async resolveArticleAccountPublishingContext(params: {
    brandId: string;
    credentialId?: string;
    organizationId: string;
    type?: ArticleGenerationType;
  }): Promise<AccountPublishingContext | undefined> {
    if (
      params.type !== ArticleGenerationType.X_ARTICLE ||
      !params.credentialId ||
      !this.accountPublishingContextService
    ) {
      return undefined;
    }

    return this.accountPublishingContextService.resolve({
      brandId: params.brandId,
      credentialId: params.credentialId,
      organizationId: params.organizationId,
      surface: 'x-article',
    });
  }

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
      // Build prompt with PromptBuilderService then call Replicate
      const generationModel = modelConfig.generationModel || DEFAULT_TEXT_MODEL;
      const responseText =
        await this.articleTextGenerationService.runTextGenerationStep({
          basePrompt: prompt,
          buildPromptOptions: {
            maxTokens: this.configService.get('MAX_TOKENS'),
            modelCategory: ModelCategory.TEXT,
            promptTemplate: PromptTemplateKey.TEXT_ARTICLE,
            systemPromptTemplate: SystemPromptKey.ARTICLE,
            temperature: 0.8,
          },
          failureMessage: 'Failed to generate content from AI service',
          harnessContext,
          model: generationModel,
          onBilling,
          organizationId,
        });

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
        const cycle = await this.articleReviewService.runReviewUpdateCycle({
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

      const accountPublishingContext =
        await this.resolveArticleAccountPublishingContext({
          brandId,
          credentialId: generateDto.credential,
          organizationId,
          type: ArticleGenerationType.X_ARTICLE,
        });

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
          ...(accountPublishingContext?.promptHints ?? []),
          ...(generateDto.keywords?.map((keyword) => `keyword: ${keyword}`) ??
            []),
          ...(generateDto.tone ? [`tone: ${generateDto.tone}`] : []),
          `targetWordCount: ${generateDto.targetWordCount || 5000}`,
        ],
        topic: generateDto.prompt,
      });
      // Build prompt with PromptBuilderService then call Replicate
      const generationModel = modelConfig.generationModel || DEFAULT_TEXT_MODEL;
      const responseText =
        await this.articleTextGenerationService.runTextGenerationStep({
          basePrompt: this.appendAccountPublishingContextToPrompt(
            prompt,
            accountPublishingContext,
          ),
          buildPromptOptions: {
            maxTokens: this.configService.get('MAX_TOKENS'),
            modelCategory: ModelCategory.TEXT,
            promptTemplate: PromptTemplateKey.X_ARTICLE_GENERATE,
            systemPromptTemplate: SystemPromptKey.X_ARTICLE,
            temperature: 0.8,
          },
          failureMessage: 'Failed to generate content from AI service',
          harnessContext,
          model: generationModel,
          onBilling,
          organizationId,
        });

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

      // Build full HTML content + reading metadata from the returned sections
      const {
        content: fullContent,
        metadata: xArticleMetadata,
        wordCount,
      } = this.buildXArticleContentAndMetadata(response.sections);

      const cycle = await this.articleReviewService.runReviewUpdateCycle({
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
        articleId: article.id,
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
        articleId: article.id,
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
        articleId: article.id,
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
      // Build prompt with PromptBuilderService then call Replicate.
      // Enhancement is intentionally unbilled, so no onBilling callback is passed.
      const responseText =
        await this.articleTextGenerationService.runTextGenerationStep({
          basePrompt: prompt,
          buildPromptOptions: {
            maxTokens: TEXT_GENERATION_LIMITS.articleEnhancement,
            modelCategory: ModelCategory.TEXT,
            systemPromptTemplate: SystemPromptKey.ARTICLE,
            temperature: 0.8,
            useTemplate: false,
          },
          failureMessage: 'Failed to enhance content from AI service',
          harnessContext,
          model: DEFAULT_MINI_TEXT_MODEL,
          organizationId,
        });

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
      await this.articleContentPersistenceService.updateArticleWithEnhancedContent(
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
        _id: article.id,
      });
      if (!updatedArticle) {
        throw new Error('Article not found after enhancement');
      }

      this.logger.log(`${this.constructorName} enhancement complete`, {
        articleId: article.id,
      });

      return updatedArticle;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} enhance failed`, {
        articleId: article.id,
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
        articleId: article.id,
      });

      // Resolve the public/preview article URL for the trailing link tweet
      let articleUrl: string | undefined;
      const publicUrl = (
        this.configService?.get('GENFEEDAI_PUBLIC_URL') as string | undefined
      )?.replace(/\/$/, '');
      if (article.slug && publicUrl) {
        const baseUrl = `${publicUrl}/articles/${article.slug}`;
        articleUrl =
          String(article.status) === ArticleStatus.PUBLIC
            ? baseUrl
            : `${baseUrl}?isPreview=true`;
      }

      const tweets = buildTwitterThreadTweets({
        articleUrl,
        content: article.content ?? '',
        label: this.getArticleLabel(article),
        summary: article.summary ?? '',
      });

      this.logger.log(
        `${this.constructorName} converted article to ${tweets.length} tweets`,
        { articleId: article.id, totalTweets: tweets.length },
      );

      return Promise.resolve({
        totalTweets: tweets.length,
        tweets,
      } as TwitterThreadResponse);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} convertToTwitterThread failed`,
        {
          articleId: article.id,
          error,
        },
      );
      throw error;
    }
  }

  /**
   * Build the concatenated HTML body and reading metadata for an X Article from
   * its generated sections. Extracted from generateLongFormArticle.
   */
  private buildXArticleContentAndMetadata(
    sections: NonNullable<ArticleGenerationResponse['sections']>,
  ): XArticleContentMetadata {
    // Headings and pull quotes are plain-text fields; escape them before
    // wrapping in HTML so generated text can't inject markup. section.content
    // is intentionally HTML and passes through unescaped.
    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Build full HTML content by concatenating sections
    const htmlParts: string[] = [];
    for (const section of sections) {
      if (section.heading) {
        htmlParts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
      }
      if (section.content) {
        htmlParts.push(section.content);
      }
      if (section.pullQuote) {
        htmlParts.push(
          `<blockquote>${escapeHtml(section.pullQuote)}</blockquote>`,
        );
      }
    }
    const content = htmlParts.join('\n');

    // Calculate word count and estimated read time
    const plainText = content.replace(/<[^>]+>/g, '');
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    const estimatedReadTime = Math.ceil(wordCount / 250);

    return {
      content,
      metadata: {
        estimatedReadTime,
        sections: sections.map((section, index) => ({
          content: section.content || '',
          heading: section.heading || '',
          id: `section-${index + 1}`,
          order: index + 1,
          pullQuote: section.pullQuote,
        })),
        wordCount,
      },
      wordCount,
    };
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

    return this.articleReviewService.reviewExistingArticle(
      article,
      organizationId,
      modelConfig,
      harnessContext,
      focus,
      onBilling,
    );
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
}
