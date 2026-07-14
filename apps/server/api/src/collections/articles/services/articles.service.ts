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
  type Article,
  type ArticleDocument,
} from '@api/collections/articles/schemas/article.schema';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleTranscriptService } from '@api/collections/articles/services/article-transcript.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import type {
  ArticleCycleModelConfig,
  ArticleReviewRubric,
} from '@api/collections/articles/services/articles-content.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregationCacheUtil } from '@api/shared/utils/aggregation-cache/aggregation-cache.util';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  ArticleScope,
  ArticleStatus,
  PromptTemplateKey,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

@Injectable()
export class ArticlesService extends BaseService<
  ArticleDocument,
  CreateArticleDto,
  UpdateArticleDto,
  Prisma.ArticleWhereInput
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly articleVersionService: ArticleVersionService,
    private readonly articleTranscriptService: ArticleTranscriptService,
    private readonly articleInsightsService: ArticleInsightsService,
    private readonly articleRemixService: ArticleRemixService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly organizationSettingsService?: OrganizationSettingsService,
    @Optional()
    @Inject(forwardRef(() => ArticlesContentService))
    private readonly articlesContentService?: ArticlesContentService,
    @Optional() protected readonly cacheService?: CacheService,
    @Optional() private readonly usersService?: UsersService,
    @Optional() private readonly organizationsService?: OrganizationsService,
    @Optional()
    private readonly cacheInvalidationService?: CacheInvalidationService,
  ) {
    super(prisma, 'article', logger, undefined, cacheService);
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  /**
   * Assert that the caller-scoping identifiers are all present and non-blank.
   * Single home for the id-validation triad previously inlined across
   * createArticle/findOneArticle/update/removeArticle.
   */
  private assertArticleOwnershipIds(
    userId: string,
    organizationId: string,
    brandId: string,
  ): void {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('Invalid userId');
    }
    if (!organizationId || organizationId.trim() === '') {
      throw new BadRequestException('Invalid organizationId');
    }
    if (!brandId || brandId.trim() === '') {
      throw new BadRequestException('Invalid brandId');
    }
  }

  /**
   * Invalidate the article cache after a write.
   * Single home for the tag block previously copy-pasted across
   * createArticle/update/removeArticle.
   *
   * Busts two layers: (1) the canonical `articles:list:{orgId}` /
   * `articles:single:{id}` keys plus the shared `articles:*` pattern via
   * CacheInvalidationService — without these, HTTP `@Cache` responses keyed by
   * org/id can go stale after a write — and (2) the legacy tag set on the
   * tag-based CacheService. See api CLAUDE.md → Cache Invalidation Pattern.
   *
   * @param context - the write that triggered invalidation (used in the debug log)
   * @param options.includePublic - also bust the `public` tag (published articles)
   * @param options.organizationId - bust this org's `articles:list:{orgId}` key
   * @param options.articleId - bust this article's `articles:single:{id}` key
   */
  private async invalidateArticleListCaches(
    context: string,
    options: {
      includePublic?: boolean;
      organizationId?: string;
      articleId?: string;
    } = {},
  ): Promise<void> {
    const { includePublic = false, organizationId, articleId } = options;

    if (this.cacheInvalidationService) {
      const keys: string[] = [];
      if (organizationId) {
        keys.push(CACHE_PATTERNS.ARTICLES_LIST(organizationId));
      }
      if (articleId) {
        keys.push(CACHE_PATTERNS.ARTICLES_SINGLE(articleId));
      }

      if (keys.length > 0) {
        await this.cacheInvalidationService.invalidate(...keys);
      }
      // Bust any remaining org/user-scoped article keys from the @Cache decorator.
      await this.cacheInvalidationService.invalidatePattern(
        `${CACHE_TAGS.ARTICLES}:*`,
      );
    }

    if (!this.cacheService) {
      return;
    }

    const collectionName = this.collectionName;
    const tagsToInvalidate = [
      CACHE_TAGS.ARTICLES,
      collectionName,
      `collection:${collectionName}`,
      `agg:${collectionName}`,
      'agg:paginated',
    ];

    if (includePublic) {
      tagsToInvalidate.push('public');
    }

    const invalidated =
      await this.cacheService.invalidateByTags(tagsToInvalidate);
    this.logger.debug(
      `${this.constructorName} invalidated ${invalidated} cache keys after ${context}`,
      { tags: tagsToInvalidate },
    );
  }

  /**
   * Generate article from YouTube transcript
   */
  @HandleErrors('generate article from transcript', 'articles')
  generateFromTranscript(
    transcriptId: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    return this.articleTranscriptService.generateFromTranscript(
      transcriptId,
      userId,
      organizationId,
      brandId,
      (dto, ownerUserId, ownerOrganizationId, ownerBrandId) =>
        this.createArticle(dto, ownerUserId, ownerOrganizationId, ownerBrandId),
    );
  }

  @HandleErrors('create article', 'articles')
  async createArticle(
    createArticleDto: CreateArticleDto,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    this.logger.debug(`${this.constructorName} create`, { createArticleDto });

    this.assertArticleOwnershipIds(userId, organizationId, brandId);

    const articleData = ArticleFilterUtil.toArticlePersistenceData({
      ...createArticleDto,
      brandId,
      organizationId,
      userId,
    });

    const result = await super.create(articleData);

    // Explicitly invalidate cache after create — canonical org/id keys + tags
    await this.invalidateArticleListCaches('create', {
      articleId: result.id,
      organizationId,
    });

    this.logger.debug(`${this.constructorName} create success`, {
      id: result.id,
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

    this.assertArticleOwnershipIds(userId, organizationId, brandId);

    const result = await super.findOne({
      id,
      brandId,
      isDeleted: false,
      organizationId,
      userId,
    });

    if (!result) {
      throw new NotFoundException('Article');
    }

    this.logger.debug(`${this.constructorName} findOne success`, {
      id: result.id,
    });

    return result;
  }

  async findBySlug(
    slug: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<Article> {
    const article = await findOrThrow(
      this.delegate,
      {
        where: {
          brandId,
          isDeleted: false,
          organizationId,
          slug,
          userId,
        },
      },
      'Article',
    );

    return article as unknown as Article;
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

      this.assertArticleOwnershipIds(userId, organizationId, brandId);

      const updateData = ArticleFilterUtil.toArticlePersistenceData({
        ...updateArticleDto,
      });

      // If status is being changed to PUBLISHED, handle publishing logic
      if (updateArticleDto.status === ArticleStatus.PUBLIC) {
        await this.applyPublishStateTransition({
          id,
          organizationId,
          publishedAtFromDto: updateArticleDto.publishedAt,
          updateData,
          userId,
        });
      }

      const result = await super.patch(id, updateData);

      // Verify the article belongs to the user/organization (ownership already checked in controller)
      if (
        !result ||
        result.isDeleted ||
        (result.userId?.toString() !== userId &&
          result.organizationId?.toString() !== organizationId)
      ) {
        throw new NotFoundException('Article');
      }

      // Explicitly invalidate cache after update — canonical org/id keys + tags
      await this.invalidateArticleListCaches('update', {
        articleId: result.id,
        includePublic: ArticleFilterUtil.isPublicArticleStatus(result.status),
        organizationId,
      });

      this.logger.debug(`${this.constructorName} update success`, {
        id: result.id,
      });

      // Send Discord notification if article was just published
      await this.sendArticlePublishedNotification(
        result,
        organizationId,
        updateArticleDto.status,
      );

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

  /**
   * Apply the publish-state transition to `updateData` when an article is moved
   * to PUBLIC: always set scope to PUBLIC and stamp publishedAt the first time
   * (preserving an existing or DTO-provided date). Extracted from `update`.
   */
  private async applyPublishStateTransition(params: {
    id: string;
    userId: string;
    organizationId: string;
    updateData: Record<string, unknown>;
    publishedAtFromDto?: string;
  }): Promise<void> {
    // Always set scope to PUBLIC when publishing
    params.updateData.scope = ArticleScope.PUBLIC;

    // Find and verify ownership
    const currentArticle = await this.findOne({
      id: params.id,
      OR: [
        { userId: params.userId },
        { organizationId: params.organizationId },
      ],
      isDeleted: false,
    });

    if (currentArticle) {
      // Set publishedAt if empty/null (first time publishing or missing date).
      // If republishing and publishedAt already exists, keep it as is.
      if (!currentArticle.publishedAt) {
        params.updateData.publishedAt =
          params.publishedAtFromDto ?? new Date().toISOString();
      }
    } else if (!params.publishedAtFromDto) {
      // Article not found, but this will be caught by the patch call below.
      // Still stamp publishedAt for safety unless the DTO provided one.
      params.updateData.publishedAt = new Date().toISOString();
    }
  }

  /**
   * Send a Discord notification when an article was just published.
   * No-op unless the status is PUBLIC, the supporting services are wired, and
   * the organization has Discord notifications enabled. Never throws — a failed
   * notification must not fail the update. Extracted from `update`.
   */
  private async sendArticlePublishedNotification(
    result: ArticleDocument,
    organizationId: string,
    status?: ArticleStatus,
  ): Promise<void> {
    if (
      status !== ArticleStatus.PUBLIC ||
      !this.notificationsService ||
      !this.organizationSettingsService ||
      !this.configService
    ) {
      return;
    }

    try {
      const organizationSettings =
        await this.organizationSettingsService.findOne({
          organizationId,
        });

      if (!organizationSettings?.isNotificationsDiscordEnabled) {
        return;
      }

      // PUBLISHED articles are public, so generate URL if slug exists
      const publicUrl = result.slug
        ? `${this.configService.get('GENFEEDAI_PUBLIC_URL')}/articles/${result.slug}`
        : undefined;
      const articleLabel = this.readString(result.label) ?? result.title;
      const articleSlug = this.readString(result.slug) ?? result.id;

      await this.notificationsService.sendArticleNotification({
        category: this.readString(result.category),
        label: articleLabel,
        publicUrl,
        slug: articleSlug,
        summary:
          this.readString(result.summary) ?? this.readString(result.excerpt),
      });

      this.logger.log(
        `${this.constructorName} sent Discord notification for published article`,
        {
          articleId: result.id,
          slug: result.slug,
        },
      );
    } catch (error: unknown) {
      // Don't fail the update if notification fails
      this.logger.error(
        `${this.constructorName} failed to send Discord notification`,
        {
          articleId: result.id,
          error,
        },
      );
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

      this.assertArticleOwnershipIds(userId, organizationId, brandId);

      // First verify the article exists and belongs to the user
      const article = await super.findOne({
        id,
        brandId,
        isDeleted: false,
        organizationId,
        userId,
      });

      if (!article) {
        throw new NotFoundException('Article');
      }

      // Soft delete by setting isDeleted to true
      await super.patch(id, { isDeleted: true }, []);

      // Explicitly invalidate cache after delete — canonical org/id keys + tags
      await this.invalidateArticleListCaches('delete', {
        articleId: id,
        organizationId,
      });

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

    const where: Record<string, unknown> = {
      isDeleted: false,
      publishedAt: { not: null },
      ...ArticleFilterUtil.buildPublicArticleStatusFilter(),
    };

    if (search) {
      where.OR = [
        { label: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (tag) {
      where.tagId = tag;
    }

    const orderBy = { [sortBy]: sortOrder } as Record<string, string>;
    const skip = (page - 1) * limit;

    const [articles, total] = await Promise.all([
      this.delegate.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.delegate.count({ where }),
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
    const where: Record<string, unknown> = {
      isDeleted: false,
      slug,
    };

    // In preview mode, allow any status/scope
    // In normal mode, only show published articles (PUBLISHED = public)
    if (!isPreview) {
      where.publishedAt = { not: null };
      Object.assign(where, ArticleFilterUtil.buildPublicArticleStatusFilter());
    }

    const article = await this.delegate.findFirst({ where });

    if (!article) {
      return null;
    }

    // Application-level join for cross-DB refs (user + organization live in auth DB)
    const articleObj = { ...article } as Record<string, unknown>;
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
          articles[0].id,
          userId,
          organizationId,
          brandId,
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName} failed to generate header image prompt for X Article`,
          { articleId: articles[0].id, error },
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
      id: articleId,
      OR: [{ userId }, { organizationId }],
      isDeleted: false,
    });

    if (!article) {
      throw new NotFoundException('Article');
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
      organizationId,
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
      id: articleId,
      OR: [{ userId }, { organizationId }],
      isDeleted: false,
    });

    if (!article) {
      throw new NotFoundException('Article');
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
  getArticleVersions(
    articleId: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<{
    articleId: string;
    totalVersions: number;
    prompts: unknown[];
  }> {
    return this.articleVersionService.getArticleVersions(
      articleId,
      userId,
      organizationId,
      brandId,
      (criteria) => this.findOne(criteria),
    );
  }

  /**
   * Restore article to a specific version (prompt)
   */
  restoreArticleVersion(
    articleId: string,
    promptId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
  ): Promise<ArticleDocument> {
    return this.articleVersionService.restoreArticleVersion(
      articleId,
      promptId,
      userId,
      organizationId,
      (criteria) => this.findOne(criteria),
      (id, updates) => this.patch(id, updates),
    );
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
      id: articleId,
      OR: [{ userId }, { organizationId }],
      isDeleted: false,
    });

    if (!article) {
      throw new NotFoundException('Article');
    }

    return this.articlesContentService.convertToTwitterThread(article);
  }

  /**
   * Analyze article virality potential using AI
   */
  analyzeVirality(
    articleId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
  ): Promise<ViralityAnalysisResponse> {
    return this.articleInsightsService.analyzeVirality(
      articleId,
      userId,
      organizationId,
      (criteria) => this.findOne(criteria),
      (id, updates) => this.patch(id, updates),
    );
  }

  /**
   * Update article performance metrics.
   */
  updatePerformanceMetrics(
    articleId: string,
    metrics: {
      views?: number;
      shares?: number;
      likes?: number;
      comments?: number;
      clickThroughRate?: number;
    },
  ): Promise<void> {
    return this.articleInsightsService.updatePerformanceMetrics(
      articleId,
      metrics,
    );
  }

  /**
   * Generate a media prompt from article content
   */
  @HandleErrors('generate prompt from article', 'articles')
  generatePromptFromArticle(
    articleId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
  ): Promise<string> {
    return this.articleInsightsService.generatePromptFromArticle(
      articleId,
      userId,
      organizationId,
      (criteria) => this.findOne(criteria),
      (id, updates) => this.patch(id, updates),
    );
  }

  /**
   * Create a remix version of an existing article.
   */
  @HandleErrors('create remix article', 'articles')
  createRemix(
    originalArticleId: string,
    userId: string,
    organizationId: string,
    brandId: string,
    options?: { label?: string },
  ): Promise<ArticleDocument> {
    return this.articleRemixService.createRemix(
      originalArticleId,
      userId,
      organizationId,
      brandId,
      options,
      (criteria) => this.findOne(criteria),
      (dto, ownerUserId, ownerOrganizationId, ownerBrandId) =>
        this.createArticle(dto, ownerUserId, ownerOrganizationId, ownerBrandId),
    );
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
      ...new Set(
        docs.map((d) => (d.userId ?? d.user)?.toString()).filter(Boolean),
      ),
    ] as string[];
    const orgIds = [
      ...new Set(
        docs
          .map((d) => (d.organizationId ?? d.organization)?.toString())
          .filter(Boolean),
      ),
    ] as string[];

    const [users, orgs] = await Promise.all([
      this.usersService && userIds.length > 0
        ? this.usersService
            .findAll({ where: {} }, { pagination: false })
            .then((result) =>
              result.docs.filter((u: Record<string, unknown>) =>
                userIds.includes(String(u.id)),
              ),
            )
        : Promise.resolve([]),
      this.organizationsService && orgIds.length > 0
        ? this.organizationsService
            .findAll({ where: {} }, { pagination: false })
            .then((result) =>
              result.docs.filter((o: Record<string, unknown>) =>
                orgIds.includes(String(o.id)),
              ),
            )
        : Promise.resolve([]),
    ]);

    const usersMap = new Map(
      users.map((u: Record<string, unknown>) => [String(u.id), u]),
    );
    const orgsMap = new Map(
      orgs.map((o: Record<string, unknown>) => [String(o.id), o]),
    );

    for (const doc of docs) {
      const docUserId = (doc.userId ?? doc.user)?.toString();
      const docOrgId = (doc.organizationId ?? doc.organization)?.toString();
      if (docUserId && usersMap.has(docUserId)) {
        doc.user = usersMap.get(docUserId);
      }
      if (docOrgId && orgsMap.has(docOrgId)) {
        doc.organization = orgsMap.get(docOrgId);
      }
    }
  }
}
