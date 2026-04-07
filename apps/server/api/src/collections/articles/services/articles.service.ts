import { ViralityAnalysisResponse } from '@api/collections/articles/dto/analyze-virality.dto';
import { TwitterThreadResponse } from '@api/collections/articles/dto/article-to-thread.dto';
import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import {
  ArticleGenerationType,
  EditArticleWithAIDto,
  GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import {
  Article,
  type ArticleDocument,
} from '@api/collections/articles/schemas/article.schema';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import type {
  ArticleCycleModelConfig,
  ArticleReviewRubric,
} from '@api/collections/articles/services/articles-content.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import {
  buildViralityAnalysisResponse,
  normalizePerformanceMetrics,
} from '@api/collections/articles/utils/virality-analysis.mapper';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregationCacheUtil } from '@api/shared/utils/aggregation-cache/aggregation-cache.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import {
  ActivitySource,
  ArticleCategory,
  ArticleScope,
  ArticleStatus,
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

@Injectable()
export class ArticlesService extends BaseService<
  ArticleDocument,
  CreateArticleDto,
  UpdateArticleDto
> {
  private readonly constructorName = this.constructor.name;
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    @InjectModel(Article.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ArticleDocument>,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,

    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly organizationSettingsService?: OrganizationSettingsService,
    @Optional()
    private readonly promptsService?: PromptsService,
    @Optional()
    private readonly articlesContentService?: ArticlesContentService,
    @Optional() private readonly templatesService?: TemplatesService,
    @Optional() protected readonly cacheService?: CacheService,
    @Optional()
    private readonly articleAnalyticsService?: ArticleAnalyticsService,
    @Optional() private readonly usersService?: UsersService,
    @Optional() private readonly organizationsService?: OrganizationsService,
    @Optional() private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional() private readonly modelsService?: ModelsService,
  ) {
    super(model, logger, undefined, cacheService);
  }

  /**
   * Generate article from YouTube transcript
   */
  @HandleErrors('generate article from transcript', 'articles')
  async generateFromTranscript(
    transcriptId: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    await this.assertDefaultTextCreditsAvailable(organizationId);

    const transcript = await this.getTranscriptById(transcriptId);

    if (!transcript) {
      throw new NotFoundException(`Transcript ${transcriptId} not found`);
    }

    // Get user prompt from template
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

    // Build prompt with PromptBuilderService then call Replicate
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

    // Extract title from generated content
    const titleMatch = articleContent.match(/^#\s+(.+)$/m);
    const title =
      titleMatch?.[1] || transcript.videoTitle || 'Generated Article';

    // Ensure transcriptText exists and is a string before substring
    const summary =
      transcript.transcriptText && typeof transcript.transcriptText === 'string'
        ? transcript.transcriptText.substring(0, 200)
        : '';

    const createDto: CreateArticleDto = {
      category: ArticleCategory.TRANSCRIPT,
      content: articleContent,
      label: title,
      status: ArticleStatus.DRAFT,
      summary,
    } as CreateArticleDto;

    const article = await this.createArticle(
      createDto,
      userId,
      organizationId,
      brandId,
    );

    // Link transcript to article
    await this.linkTranscriptToArticle(transcriptId, article._id.toString());

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
        maxOverdraftCredits: ArticlesService.TEXT_MAX_OVERDRAFT_CREDITS,
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

  /**
   * Get transcript by ID (calls transcripts service via HTTP)
   */
  private async getTranscriptById(
    transcriptId: string,
  ): Promise<{ transcriptText?: string; videoTitle?: string } | null> {
    // Internal service communication
    const apiUrl = `http://localhost:3010/transcripts/${transcriptId}`;

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

  /**
   * Link transcript to article
   */
  private async linkTranscriptToArticle(
    transcriptId: string,
    articleId: string,
  ): Promise<void> {
    // Internal service communication
    const apiUrl = `http://localhost:3010/transcripts/${transcriptId}`;

    try {
      await fetch(apiUrl, {
        body: JSON.stringify({
          article: articleId,
          status: 'completed',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      });
    } catch (error: unknown) {
      this.logger.error('Failed to link transcript to article', error);
    }
  }

  /**
   * Get context-aware population options to prevent over-fetching
   * @param context - The context determining which fields to populate
   */
  protected getPopulationForContext(
    context: 'list' | 'detail' | 'minimal' | 'create' = 'minimal',
  ): PopulateOption[] {
    switch (context) {
      case 'list':
        // For list views — user/org are in auth DB (cross-DB), populate only same-DB refs
        return [
          PopulatePatterns.brandMinimal,
          { path: 'tags', select: '_id label' },
        ];
      case 'detail':
        // For detail views — user/org are in auth DB (cross-DB), populate only same-DB refs
        return [
          PopulatePatterns.brandMinimal,
          { path: 'tags', select: '_id label' },
        ];
      case 'create':
        // After creation, return essential fields — brand is same-DB
        return [PopulatePatterns.brandMinimal];
      default:
        // Minimal population for basic operations
        return [PopulatePatterns.brandId];
    }
  }

  @HandleErrors('create article', 'articles')
  async createArticle(
    createArticleDto: CreateArticleDto,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    this.logger.debug(`${this.constructorName} create`, { createArticleDto });

    // Validate ObjectId parameters
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId');
    }
    if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
      throw new Error('Invalid organizationId');
    }
    if (!brandId || !Types.ObjectId.isValid(brandId)) {
      throw new Error('Invalid brandId');
    }

    const articleData = {
      ...createArticleDto,
      brand: new Types.ObjectId(brandId),
      organization: new Types.ObjectId(organizationId),
      user: new Types.ObjectId(userId),
    };

    const result = await super.create(
      articleData,
      this.getPopulationForContext('create'),
    );

    // Explicitly invalidate cache after create - invalidate ALL possible tags
    if (this.cacheService) {
      const collectionName = this.collectionName;
      const tagsToInvalidate = [
        'articles',
        collectionName,
        `collection:${collectionName}`,
        `agg:${collectionName}`,
        'agg:paginated',
      ];

      // Invalidate all tags in one call
      const invalidated =
        await this.cacheService.invalidateByTags(tagsToInvalidate);
      this.logger.debug(
        `${this.constructorName} invalidated ${invalidated} cache keys after create`,
        { tags: tagsToInvalidate },
      );
    }

    this.logger.debug(`${this.constructorName} create success`, {
      id: result._id,
    });
    return result;
  }

  @HandleErrors('find one article', 'articles')
  async findOneArticle(
    id: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    this.logger.debug(`${this.constructorName} findOne`, { id });

    // Validate ObjectId parameters
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId');
    }

    if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
      throw new Error('Invalid organizationId');
    }

    if (!brandId || !Types.ObjectId.isValid(brandId)) {
      throw new Error('Invalid brandId');
    }

    const result = await super.findOne(
      {
        _id: id,
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        user: userId,
      },
      this.getPopulationForContext('detail'),
    );

    if (!result) {
      throw new NotFoundException('Article not found');
    }

    this.logger.debug(`${this.constructorName} findOne success`, {
      id: result._id,
    });

    return result;
  }

  async findBySlug(
    slug: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<Article> {
    const article = await this.model
      .findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        slug,
        user: userId,
      })
      .populate('tags', 'label backgroundColor textColor')
      .exec();

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return article;
  }

  async update(
    id: string,
    updateArticleDto: UpdateArticleDto,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    try {
      this.logger.debug(`${this.constructorName} update`, {
        id,
        updateArticleDto,
      });

      // Validate ObjectId parameters
      if (!userId || !Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
      }

      if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
        throw new Error('Invalid organizationId');
      }

      if (!brandId || !Types.ObjectId.isValid(brandId)) {
        throw new Error('Invalid brandId');
      }

      const updateData: Record<string, unknown> = { ...updateArticleDto };

      // If status is being changed to PUBLISHED, handle publishing logic
      if (updateArticleDto.status === ArticleStatus.PUBLIC) {
        // Find and verify ownership
        const currentArticle = await this.findOne({
          _id: new Types.ObjectId(id),
          $or: [
            { user: new Types.ObjectId(userId) },
            { organization: new Types.ObjectId(organizationId) },
          ],
          isDeleted: false,
        });

        if (currentArticle) {
          // Always set scope to PUBLIC when publishing
          updateData.scope = ArticleScope.PUBLIC;

          // Set publishedAt if empty/null (first time publishing or missing date)
          if (!currentArticle.publishedAt) {
            updateData.publishedAt = new Date();
          }

          // If republishing and publishedAt already exists, keep it as is (unless explicitly provided in DTO)
        } else {
          // Article not found, but this will be caught by the patch call below
          // Still set scope and publishedAt for safety
          updateData.scope = ArticleScope.PUBLIC;
          if (!updateArticleDto.publishedAt) {
            updateData.publishedAt = new Date();
          }
        }
      }

      const result = await super.patch(
        id,
        updateData,
        this.getPopulationForContext('detail'),
      );

      // Verify the article belongs to the user/organization (ownership already checked in controller)
      if (
        !result ||
        result.isDeleted ||
        (result.user._id.toString() !== userId &&
          result.organization._id.toString() !== organizationId)
      ) {
        throw new NotFoundException('Article not found');
      }

      // Explicitly invalidate ALL cache after update - invalidate ALL possible tags
      if (this.cacheService) {
        const collectionName = this.collectionName;
        const tagsToInvalidate = [
          'articles',
          collectionName,
          `collection:${collectionName}`,
          `agg:${collectionName}`,
          'agg:paginated',
        ];

        // If article is published, also invalidate public cache (PUBLISHED = public)
        if (result.status === ArticleStatus.PUBLIC) {
          tagsToInvalidate.push('public');
        }

        // Invalidate all tags in one call
        const invalidated =
          await this.cacheService.invalidateByTags(tagsToInvalidate);
        this.logger.debug(
          `${this.constructorName} invalidated ${invalidated} cache keys after update`,
          { tags: tagsToInvalidate },
        );
      }

      this.logger.debug(`${this.constructorName} update success`, {
        id: result._id,
      });

      // Send Discord notification if article was just published
      if (
        updateArticleDto.status === ArticleStatus.PUBLIC &&
        this.notificationsService &&
        this.organizationSettingsService &&
        this.configService
      ) {
        try {
          const organizationSettings =
            await this.organizationSettingsService.findOne({
              organization: new Types.ObjectId(organizationId),
            });

          if (organizationSettings?.isNotificationsDiscordEnabled) {
            // PUBLISHED articles are public, so generate URL if slug exists
            const publicUrl = result.slug
              ? `${this.configService.get('GENFEEDAI_PUBLIC_URL')}/articles/${result.slug}`
              : undefined;

            await this.notificationsService.sendArticleNotification({
              category: result.category,
              label: result.label,
              publicUrl,
              slug: result.slug,
              summary: result.summary,
            });

            this.logger.log(
              `${this.constructorName} sent Discord notification for published article`,
              {
                articleId: result._id,
                slug: result.slug,
              },
            );
          }
        } catch (error: unknown) {
          // Don't fail the update if notification fails
          this.logger.error(
            `${this.constructorName} failed to send Discord notification`,
            {
              articleId: result._id,
              error,
            },
          );
        }
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} update failed`, {
        error,
        id,
        updateArticleDto,
      });
      throw error;
    }
  }

  async removeArticle(
    id: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    try {
      this.logger.debug(`${this.constructorName} remove`, { id });

      // Validate ObjectId parameters
      if (!userId || !Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
      }
      if (!organizationId || !Types.ObjectId.isValid(organizationId)) {
        throw new Error('Invalid organizationId');
      }
      if (!brandId || !Types.ObjectId.isValid(brandId)) {
        throw new Error('Invalid brandId');
      }

      // First verify the article exists and belongs to the user
      const article = await super.findOne(
        {
          _id: id,
          brand: brandId,
          isDeleted: false,
          organization: organizationId,
          user: userId,
        },
        [],
      );

      if (!article) {
        throw new NotFoundException('Article not found');
      }

      // Soft delete by setting isDeleted to true
      await super.patch(id, { isDeleted: true }, []);

      // Explicitly invalidate ALL cache after delete - invalidate ALL possible tags
      if (this.cacheService) {
        const collectionName = this.collectionName;

        const tagsToInvalidate = [
          'articles',
          collectionName,
          `collection:${collectionName}`,
          `agg:${collectionName}`,
          'agg:paginated',
        ];

        // Invalidate all tags in one call
        const invalidated =
          await this.cacheService.invalidateByTags(tagsToInvalidate);
        this.logger.debug(
          `${this.constructorName} invalidated ${invalidated} cache keys after delete`,
          { tags: tagsToInvalidate },
        );
      }

      this.logger.debug(`${this.constructorName} remove success`, { id });
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} remove failed`, {
        error,
        id,
      });
      throw error;
    }
  }

  // Public methods for website
  async findPublicArticles(query: ArticlesQueryDto) {
    const {
      search,
      category,
      tag,
      page = 1,
      limit = 10,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
    } = query;

    const filter: Record<string, unknown> = {
      isDeleted: false,
      publishedAt: { $exists: true },
      status: ArticleStatus.PUBLIC,
    };

    if (search) {
      filter.$or = [
        { label: { $options: 'i', $regex: search } },
        { summary: { $options: 'i', $regex: search } },
        { content: { $options: 'i', $regex: search } },
      ];
    }

    if (category) {
      filter.category = category;
    }

    if (tag) {
      filter.tags = new Types.ObjectId(tag);
    }

    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const [articles, total] = await Promise.all([
      this.model
        .find(filter)
        .populate('tags', 'label backgroundColor textColor')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter),
    ]);

    // Application-level join for cross-DB refs (user + organization live in auth DB)
    await this.hydrateUserAndOrganization(articles);

    return {
      articles,
      limit,
      page,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublicArticleBySlug(
    slug: string,
    isPreview: boolean = false,
  ): Promise<Article | null> {
    let query: Record<string, unknown> = {
      isDeleted: false,
      slug,
    };

    // In preview mode, allow any status/scope
    // In normal mode, only show published articles (PUBLISHED = public)
    if (!isPreview) {
      query = {
        ...query,
        publishedAt: { $exists: true },
        status: ArticleStatus.PUBLIC,
      };
    }

    const article: ArticleDocument | null = await this.model
      .findOne<ArticleDocument>(query)
      .populate('tags', 'label backgroundColor textColor')
      .populate(
        'brand',
        'handle label description website logo banner credentials',
      )
      .exec();

    if (!article) {
      return null;
    }

    // Populate banner only if it's a valid ObjectId (not empty string)
    // Empty strings cause CastError when Mongoose tries to cast to ObjectId
    const bannerValue = article.banner as unknown as
      | Types.ObjectId
      | string
      | null;
    const isValidBanner =
      bannerValue &&
      (bannerValue instanceof Types.ObjectId ||
        (typeof bannerValue === 'string' &&
          bannerValue !== '' &&
          Types.ObjectId.isValid(bannerValue)));

    if (isValidBanner) {
      await article.populate({
        path: 'banner',
        select: '_id category parent parentModel',
      });
    } else if (
      !bannerValue ||
      bannerValue === '' ||
      (typeof bannerValue === 'string' && !Types.ObjectId.isValid(bannerValue))
    ) {
      // Clean up empty string or invalid banner values
      article.banner = null as unknown as Types.ObjectId;
    }

    // Application-level join for cross-DB refs (user + organization live in auth DB)
    const articleObj = article.toObject ? article.toObject() : article;
    await this.hydrateUserAndOrganization([articleObj]);

    return articleObj as unknown as Article;
  }

  /**
   * Generate articles using OpenAI assistant - delegates to ArticlesContentService
   */
  async generateArticles(
    generateDto: GenerateArticlesDto,
    userId: string,
    organizationId: string,
    brandId: string,
    onBilling?: (amount: number) => void,
  ): Promise<ArticleDocument[]> {
    if (!this.articlesContentService) {
      throw new Error('ArticlesContentService not available');
    }

    const modelConfig =
      await this.resolveArticleCycleModelConfig(organizationId);
    const generationType = generateDto.type || ArticleGenerationType.STANDARD;

    const articles =
      generationType === ArticleGenerationType.X_ARTICLE
        ? [
            await this.articlesContentService.generateLongFormArticle(
              generateDto,
              userId,
              organizationId,
              brandId,
              modelConfig,
              this.createArticle.bind(this),
              (charge) => onBilling?.(charge.amount),
            ),
          ]
        : await this.articlesContentService.generateArticles(
            generateDto,
            userId,
            organizationId,
            brandId,
            modelConfig,
            this.createArticle.bind(this),
            (charge) => onBilling?.(charge.amount),
          );

    if (
      generationType === ArticleGenerationType.X_ARTICLE &&
      generateDto.generateHeaderImage !== false &&
      articles[0]
    ) {
      try {
        await this.generatePromptFromArticle(
          articles[0]._id.toString(),
          userId,
          organizationId,
          brandId,
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName} failed to generate header image prompt for X Article`,
          { articleId: articles[0]._id, error },
        );
      }
    }

    // Invalidate cache after generating articles (invalidate ALL cache tags for articles)
    if (this.cacheService) {
      const collectionName = this.collectionName;
      // Invalidate all possible cache tags
      await AggregationCacheUtil.invalidateCollectionCache(
        this.cacheService,
        collectionName,
      );
      await AggregationCacheUtil.invalidateAllAggregationCache(
        this.cacheService,
      );
      await this.cacheService.invalidateByTags([
        'articles',
        `collection:${collectionName}`,
        `agg:${collectionName}`,
        'agg:paginated',
      ]);
    }

    return articles;
  }

  async reviewArticle(
    articleId: string,
    userId: string,
    organizationId: string,
    focus?: string,
    onBilling?: (amount: number) => void,
  ): Promise<ArticleReviewRubric> {
    if (!this.articlesContentService) {
      throw new Error('ArticlesContentService not available');
    }

    const article = await this.findOne({
      _id: new Types.ObjectId(articleId),
      $or: [
        { user: new Types.ObjectId(userId) },
        { organization: new Types.ObjectId(organizationId) },
      ],
      isDeleted: false,
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const modelConfig =
      await this.resolveArticleCycleModelConfig(organizationId);
    return this.articlesContentService.reviewExistingArticle(
      article,
      organizationId,
      modelConfig,
      focus,
      (charge) => onBilling?.(charge.amount),
    );
  }

  async resolveArticleCycleModelConfig(
    organizationId: string,
  ): Promise<ArticleCycleModelConfig> {
    if (!this.organizationSettingsService) {
      return {
        generationModel: DEFAULT_TEXT_MODEL,
        reviewModel: DEFAULT_MINI_TEXT_MODEL,
        updateModel: DEFAULT_MINI_TEXT_MODEL,
      };
    }

    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    return {
      generationModel: settings?.defaultModel || DEFAULT_TEXT_MODEL,
      reviewModel: settings?.defaultModelReview || DEFAULT_MINI_TEXT_MODEL,
      updateModel: settings?.defaultModelUpdate || DEFAULT_MINI_TEXT_MODEL,
    };
  }

  /**
   * Edit existing article using AI - delegates to ArticlesContentService
   *
   * Template is selected based on editDto.enhanceType:
   * - 'edit' (default): Uses ARTICLE_EDIT template
   * - 'seo': Uses ARTICLE_SEO template for SEO optimization
   */
  async enhance(
    articleId: string,
    editDto: EditArticleWithAIDto,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    if (!this.articlesContentService) {
      throw new Error('ArticlesContentService not available');
    }

    // Get the existing article
    const article = await this.findOne({
      _id: new Types.ObjectId(articleId),
      $or: [
        { user: new Types.ObjectId(userId) },
        { organization: new Types.ObjectId(organizationId) },
      ],
      isDeleted: false,
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Select template based on enhanceType
    const templateKey =
      editDto.enhanceType === 'seo'
        ? PromptTemplateKey.ARTICLE_SEO
        : PromptTemplateKey.ARTICLE_EDIT;

    // Returns immediately with PROCESSING status, updates via websocket when complete
    return this.articlesContentService.enhance(
      article,
      editDto,
      userId,
      organizationId,
      brandId,
      templateKey,
    );
  }

  /**
   * Get version history for an article using prompts collection
   */
  async getArticleVersions(
    articleId: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<{
    articleId: Types.ObjectId;
    totalVersions: number;
    prompts: unknown[];
  }> {
    try {
      // Verify article exists
      const article = await this.findOne({
        _id: new Types.ObjectId(articleId),
        $or: [
          { user: new Types.ObjectId(userId) },
          { organization: new Types.ObjectId(organizationId) },
        ],
        isDeleted: false,
      });

      if (!article) {
        throw new NotFoundException('Article not found');
      }

      if (!this.promptsService) {
        return {
          articleId: article._id,
          prompts: [],
          totalVersions: 0,
        };
      }

      // Get all prompts for this article
      const aggregate: PipelineStage[] = [
        {
          $match: {
            article: new Types.ObjectId(articleId),
            brand: new Types.ObjectId(brandId),
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
            user: new Types.ObjectId(userId),
          },
        },
        {
          $sort: { createdAt: 1 }, // Oldest first (chronological order)
        },
      ];

      const promptsResult = await this.promptsService.findAll(aggregate, {
        pagination: false,
      });
      const prompts = promptsResult.docs;

      return {
        articleId: article._id,
        prompts: prompts.map((p, index) => ({
          id: p._id,
          prompt: p.original,
          result: p.enhanced,
          version: index + 1,
          // createdAt: p.createdAt,
        })),
        totalVersions: prompts.length,
      };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} getArticleVersions failed`, {
        articleId,
        error,
      });
      throw error;
    }
  }

  /**
   * Restore article to a specific version (prompt)
   */
  async restoreArticleVersion(
    articleId: string,
    promptId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
  ): Promise<ArticleDocument> {
    try {
      // Verify article exists
      const article = await this.findOne({
        _id: new Types.ObjectId(articleId),
        $or: [
          { user: new Types.ObjectId(userId) },
          { organization: new Types.ObjectId(organizationId) },
        ],
        isDeleted: false,
      });

      if (!article) {
        throw new NotFoundException('Article not found');
      }

      if (!this.promptsService) {
        throw new Error('Prompts service not available');
      }

      // Get the prompt
      const prompt = await this.promptsService.findOne({
        _id: promptId,
        article: new Types.ObjectId(articleId),
        isDeleted: false,
        user: new Types.ObjectId(userId),
      });

      if (!prompt) {
        throw new NotFoundException('Version not found');
      }

      // Parse the enhanced data - validate it exists and is valid JSON
      if (!prompt.enhanced || typeof prompt.enhanced !== 'string') {
        throw new NotFoundException(
          'Version data is missing or invalid - cannot restore',
        );
      }

      let versionData: { content?: string; title?: string; summary?: string };
      try {
        versionData = JSON.parse(prompt.enhanced) as {
          content?: string;
          title?: string;
          summary?: string;
        };
      } catch (parseError) {
        this.logger.error('Failed to parse version data', {
          articleId,
          parseError,
          promptId,
        });

        throw new NotFoundException(
          'Version data is corrupted - cannot restore',
        );
      }

      // Restore to this version
      await this.patch(articleId, {
        content: versionData.content,
        label: versionData.title,
        summary: versionData.summary,
      });

      this.logger.log(`${this.constructorName} restored article to prompt`, {
        articleId,
        promptId,
      });

      const updatedArticle = await this.findOne(
        {
          _id: new Types.ObjectId(articleId),
          $or: [
            { user: new Types.ObjectId(userId) },
            { organization: new Types.ObjectId(organizationId) },
          ],
          isDeleted: false,
        },
        this.getPopulationForContext('detail'),
      );

      if (!updatedArticle) {
        throw new NotFoundException('Article not found');
      }

      return updatedArticle;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} restoreArticleVersion failed`,
        {
          articleId,
          error,
          promptId,
        },
      );
      throw error;
    }
  }

  /**
   * Convert article to Twitter thread - delegates to ArticlesContentService
   */
  async convertToTwitterThread(
    articleId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
  ): Promise<TwitterThreadResponse> {
    if (!this.articlesContentService) {
      throw new Error('ArticlesContentService not available');
    }

    // Get article
    const article = await this.findOne({
      _id: new Types.ObjectId(articleId),
      $or: [
        { user: new Types.ObjectId(userId) },
        { organization: new Types.ObjectId(organizationId) },
      ],
      isDeleted: false,
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return this.articlesContentService.convertToTwitterThread(article);
  }

  /**
   * Analyze article virality potential using AI
   */
  async analyzeVirality(
    articleId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
  ): Promise<ViralityAnalysisResponse> {
    try {
      this.logger.debug(`${this.constructorName} analyzeVirality`, {
        articleId,
      });

      // Get the article
      const article = await this.findOne({
        _id: new Types.ObjectId(articleId),
        $or: [
          { user: new Types.ObjectId(userId) },
          { organization: new Types.ObjectId(organizationId) },
        ],
        isDeleted: false,
      });

      if (!article) {
        throw new NotFoundException('Article not found');
      }

      if (!this.replicateService || !this.configService) {
        throw new Error('OpenAI service not available');
      }

      // Get user prompt from template
      const userPrompt = await this.templatesService?.getRenderedPrompt(
        PromptTemplateKey.ARTICLE_VIRALITY,
        {
          category: article.category,
          content: article.content,
          summary: article.summary,
          title: article.label,
        },
        organizationId,
      );

      if (!userPrompt) {
        throw new Error('Template service not available');
      }

      // Build prompt with PromptBuilderService then call Replicate
      const { input: viralityInput } =
        (await this.promptBuilderService?.buildPrompt(
          DEFAULT_MINI_TEXT_MODEL,
          {
            maxTokens: TEXT_GENERATION_LIMITS.articleVirality,
            modelCategory: ModelCategory.TEXT,
            prompt: userPrompt,
            promptTemplate: PromptTemplateKey.TEXT_VIRALITY,
            systemPromptTemplate: SystemPromptKey.VIRALITY,
            temperature: 0.7,
          },
          organizationId,
        )) || { input: {} };

      const responseText =
        await this.replicateService?.generateTextCompletionSync(
          DEFAULT_MINI_TEXT_MODEL,
          viralityInput,
        );

      // Parse JSON response
      let response: unknown;
      try {
        response = JSON.parse(responseText) as unknown;
      } catch (parseError) {
        this.logger.error('Failed to parse virality analysis JSON', {
          parseError,
          responseText: responseText.substring(0, 500),
        });
        throw new Error('Invalid JSON response from AI service');
      }

      // Validate + build analysis via shared mapper
      const result = buildViralityAnalysisResponse(articleId, response);

      // Update article with analysis
      await this.patch(articleId, { viralityAnalysis: result.analysis });

      this.logger.log(`${this.constructorName} completed virality analysis`, {
        articleId,
        score: result.analysis.score,
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} analyzeVirality failed`, {
        articleId,
        error,
      });
      throw error;
    }
  }

  /**
   * Update article performance metrics (called by analytics service or webhooks)
   * Now uses the separate article-analytics collection instead of embedded metrics
   */
  async updatePerformanceMetrics(
    articleId: string,
    metrics: {
      views?: number;
      shares?: number;
      likes?: number;
      comments?: number;
      clickThroughRate?: number;
    },
  ): Promise<void> {
    try {
      this.logger.debug(`${this.constructorName} updatePerformanceMetrics`, {
        articleId,
        metrics,
      });

      if (!this.articleAnalyticsService) {
        this.logger.warn(
          `${this.constructorName} ArticleAnalyticsService not available, skipping metrics update`,
        );
        return;
      }

      // Use the new article-analytics collection
      await this.articleAnalyticsService.updatePerformanceMetrics(
        articleId,
        normalizePerformanceMetrics(metrics),
      );

      this.logger.log(`${this.constructorName} updated performance metrics`, {
        articleId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} updatePerformanceMetrics failed`,
        {
          articleId,
          error,
        },
      );
      throw error;
    }
  }

  /**
   * Generate a media prompt from article content
   */
  @HandleErrors('generate prompt from article', 'articles')
  async generatePromptFromArticle(
    articleId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.logger.debug(`${url} started`, { articleId });

      // Find article
      const article = await this.findOne({
        _id: new Types.ObjectId(articleId),
        $or: [
          { user: new Types.ObjectId(userId) },
          { organization: new Types.ObjectId(organizationId) },
        ],
        isDeleted: false,
      });

      if (!article) {
        throw new NotFoundException('Article not found');
      }

      if (!this.replicateService) {
        throw new Error('OpenAI service not available');
      }

      // Get user prompt from template - ensure content is a string
      const contentForPrompt =
        article.content && typeof article.content === 'string'
          ? article.content.substring(0, 2000)
          : '';

      const userPrompt = await this.templatesService?.getRenderedPrompt(
        PromptTemplateKey.ARTICLE_IMAGE_PROMPT,
        {
          content: contentForPrompt,
          summary: article.summary,
          title: article.label,
        },
        organizationId,
      );

      if (!userPrompt) {
        throw new Error('Template service not available');
      }

      // Build prompt with PromptBuilderService then call Replicate
      const { input: imagePromptInput } =
        (await this.promptBuilderService?.buildPrompt(
          DEFAULT_MINI_TEXT_MODEL,
          {
            maxTokens: TEXT_GENERATION_LIMITS.articleImagePrompt,
            modelCategory: ModelCategory.TEXT,
            prompt: userPrompt,
            promptTemplate: PromptTemplateKey.TEXT_IMAGE_PROMPT,
            systemPromptTemplate: SystemPromptKey.IMAGE_PROMPT,
            temperature: 0.8,
          },
          organizationId,
        )) || { input: {} };

      const responseText =
        await this.replicateService?.generateTextCompletionSync(
          DEFAULT_MINI_TEXT_MODEL,
          imagePromptInput,
        );

      if (!responseText) {
        throw new Error('Failed to generate prompt from AI service');
      }

      // Update article with generated prompt
      await this.patch(articleId, { generationPrompt: responseText.trim() });

      this.logger.log(`${url} completed`, {
        articleId,
        promptLength: responseText.length,
      });

      return responseText.trim();
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, { articleId, error });
      throw error;
    }
  }

  /**
   * Create a remix version of an existing article
   * Copies all properties from the original article with optional new title
   * Stores reference to original article for tracking
   */
  @HandleErrors('create remix article', 'articles')
  async createRemix(
    originalArticleId: string,
    userId: string,
    organizationId: string,
    brandId: string,
    options?: {
      label?: string;
    },
  ): Promise<ArticleDocument> {
    const url = CallerUtil.getCallerName();

    // Find the original article
    const originalArticle = await this.findOne({
      _id: new Types.ObjectId(originalArticleId),
      $or: [
        { user: new Types.ObjectId(userId) },
        { organization: new Types.ObjectId(organizationId) },
      ],
      isDeleted: false,
    });

    if (!originalArticle) {
      throw new NotFoundException(
        `Original article with ID ${originalArticleId} not found`,
      );
    }

    this.logger.log(`${url} creating remix`, {
      originalArticleId,
      originalTitle: originalArticle.label,
    });

    // Create the remix article with copied data
    const remixTitle =
      options?.label || `Remix: ${originalArticle.label || 'Untitled'}`;

    // Generate a unique slug for the remix to avoid duplicate key error
    // The slug field has a unique constraint, so we need a unique value
    // Handle case where original article slug might be null/undefined
    const baseSlug = originalArticle.slug || 'article';
    const remixSlug = `${baseSlug}-remix-${Date.now()}`;

    const remixDto: CreateArticleDto = {
      category: originalArticle.category || ArticleCategory.POST,
      content: originalArticle.content,
      label: remixTitle,
      scope: originalArticle.scope || ArticleScope.USER,
      slug: remixSlug,
      status: ArticleStatus.DRAFT, // Always start as draft
      summary: originalArticle.summary,
      tags: originalArticle.tags || [],
    };

    const remixArticle = await this.createArticle(
      remixDto,
      userId,
      organizationId,
      brandId,
    );

    this.logger.log(`${url} remix created`, {
      originalArticleId,
      remixArticleId: remixArticle._id,
    });

    return remixArticle;
  }

  /**
   * Hydrate user and organization fields via application-level join.
   * These refs live in the auth DB and cannot be populated cross-database.
   */
  private async hydrateUserAndOrganization(
    docs: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (docs.length === 0) {
      return;
    }

    const userIds = [
      ...new Set(docs.map((d) => d.user?.toString()).filter(Boolean)),
    ];
    const orgIds = [
      ...new Set(docs.map((d) => d.organization?.toString()).filter(Boolean)),
    ];

    const [users, orgs] = await Promise.all([
      this.usersService && userIds.length > 0
        ? this.usersService
            .findAll(
              [
                {
                  $match: {
                    _id: {
                      $in: userIds.map((id) => new Types.ObjectId(id)),
                    },
                  },
                },
                {
                  $project: {
                    _id: 1,
                    email: 1,
                    firstName: 1,
                    handle: 1,
                    lastName: 1,
                  },
                },
              ],
              { pagination: false },
            )
            .then((result) => result.docs)
        : Promise.resolve([]),
      this.organizationsService && orgIds.length > 0
        ? this.organizationsService
            .findAll(
              [
                {
                  $match: {
                    _id: {
                      $in: orgIds.map((id) => new Types.ObjectId(id)),
                    },
                  },
                },
                { $project: { _id: 1, label: 1 } },
              ],
              { pagination: false },
            )
            .then((result) => result.docs)
        : Promise.resolve([]),
    ]);

    const usersMap = new Map(
      users.map((u: { _id: Types.ObjectId }) => [u._id.toString(), u]),
    );
    const orgsMap = new Map(
      orgs.map((o: { _id: Types.ObjectId }) => [o._id.toString(), o]),
    );

    for (const doc of docs) {
      const userId = doc.user?.toString();
      const orgId = doc.organization?.toString();
      if (userId && usersMap.has(userId)) {
        doc.user = usersMap.get(userId);
      }
      if (orgId && orgsMap.has(orgId)) {
        doc.organization = orgsMap.get(orgId);
      }
    }
  }
}
