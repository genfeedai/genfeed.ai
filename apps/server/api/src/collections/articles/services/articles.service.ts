import {
  ARTICLE_FINALIZE_GENERATION_ACTION_ID,
  ARTICLE_GENERATE_DRAFTS_ACTION_ID,
  ARTICLE_GENERATION_TOOL_ID,
  ARTICLE_GENERATION_WORKFLOW_ID,
  ARTICLE_INVALIDATE_GENERATION_ACTION_ID,
  ARTICLE_LOAD_GENERATION_ACTION_ID,
  ARTICLE_LOAD_REVIEW_ACTION_ID,
  ARTICLE_PERSIST_DRAFT_ACTION_ID,
  ARTICLE_REVIEW_ACTION_ID,
  ARTICLE_REVIEW_DRAFT_ACTION_ID,
  ARTICLE_REVIEW_WORKFLOW_ID,
  ARTICLE_REVISE_DRAFT_ACTION_ID,
  articleGenerationChildWorkflow,
  articleReviewWorkflow,
  buildArticleGenerationWorkflowDefinition,
} from '@api/collections/articles/services/article-workflow-definitions';
import { invalidateArticleListCaches } from '@api/collections/articles/utils/article-query-cache.util';
import { hydrateArticleReferences } from '@api/collections/articles/utils/article-reference-hydration.util';
import {
  readArticleGenerationInput,
  requiredString,
} from '@api/collections/articles/utils/article-workflow-input.util';

export {
  ARTICLE_GENERATION_TOOL_ID,
  ARTICLE_REVIEW_ACTION_ID,
  buildArticleGenerationWorkflowDefinition,
} from '@api/collections/articles/services/article-workflow-definitions';

import { ViralityAnalysisResponse } from '@api/collections/articles/dto/analyze-virality.dto';
import { TwitterThreadResponse } from '@api/collections/articles/dto/article-to-thread.dto';
import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';
import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import {
  type Article,
  type ArticleDocument,
} from '@api/collections/articles/schemas/article.schema';
import {
  type ArticleGenerationActionResult,
  type ArticleGenerationFinalState,
  articleWorkflowRuntime,
  finalizeArticleGeneration,
  readArticleWorkflowByok,
} from '@api/collections/articles/services/article-generation-workflow.util';
import {
  ARTICLE_HEADER_PROMPT_ACTION_IDS,
  ARTICLE_HEADER_PROMPT_WORKFLOW_DEFINITION,
  ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
} from '@api/collections/articles/services/article-header-prompt-workflow-definition';
import { ArticleInsightsService } from '@api/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@api/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@api/collections/articles/services/article-version.service';
import type {
  ArticleCycleModelConfig,
  ArticleExistingReviewContext,
  ArticleGenerationContext,
  ArticleGenerationReviewState,
  ArticleGenerationRevisionState,
  ArticleGenerationWorkItem,
  ArticleReviewRubric,
} from '@api/collections/articles/services/articles-content.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { assertArticleOwnershipIds } from '@api/collections/articles/utils/article-input-boundary.util';
import { sendArticlePublishedNotification } from '@api/collections/articles/utils/article-published-notification.util';
import {
  assertPublicSlugAvailable,
  assertPublishedSlugTransition,
  mapPublicSlugConflict,
} from '@api/collections/articles/utils/article-slug.util';
import { PublicArticleScope } from '@api/collections/articles/utils/public-article-scope.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import { scopedWhere } from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { TextByokDispatch } from '@api/services/byok/text-dispatch-byok.util';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  invalidateAllPaginatedQueryCaches,
  invalidateCollectionQueryCache,
  paginatedQueryCacheTag,
} from '@api/shared/utils/query-cache/query-cache.util';
import { ArticleScope, WorkflowExecutionTrigger } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  forwardRef,
  Inject,
  Injectable,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export type { ArticleGenerationActionResult } from '@api/collections/articles/services/article-generation-workflow.util';

type ArticleHeaderPromptState = {
  article: ArticleDocument;
  articleId: string;
  organizationId: string;
  prompt?: string;
};

export type ArticleReviewActionResult = {
  billedCredits: number;
  review: ArticleReviewRubric;
};

@Injectable()
export class ArticlesService
  extends BaseService<
    ArticleDocument,
    CreateArticleDto,
    UpdateArticleDto,
    Prisma.ArticleWhereInput
  >
  implements OnModuleInit
{
  private readonly constructorName = this.constructor.name;
  readonly publicArticleScope = new PublicArticleScope(
    () => this.organizationsService,
  );

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly articleVersionService: ArticleVersionService,
    private readonly articleInsightsService: ArticleInsightsService,
    private readonly articleRemixService: ArticleRemixService,
    @Optional()
    private readonly activityRecorder?: ActivityRecorderService,
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
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional()
    private readonly agentChatModelRegistry?: AgentChatModelRegistryService,
  ) {
    super(prisma, 'article', logger, undefined, cacheService);
  }

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    runner.registerAction(
      ARTICLE_LOAD_GENERATION_ACTION_ID,
      async ({ context, input }) => {
        const dto = readArticleGenerationInput(input.dto);
        const brandId = requiredString(input.brandId, 'brandId');
        const modelConfig = await this.resolveArticleCycleModelConfig(
          context.organizationId,
          dto.model,
        );
        return this.requireArticlesContentService().prepareGeneration(
          dto,
          context.userId,
          context.organizationId,
          brandId,
          modelConfig,
        );
      },
    );
    runner.registerAction(ARTICLE_GENERATE_DRAFTS_ACTION_ID, (request) =>
      this.requireArticlesContentService().generateDrafts(
        request.input.state as ArticleGenerationContext,
        readArticleWorkflowByok(request.runtimeContext),
      ),
    );
    runner.registerAction(ARTICLE_REVIEW_DRAFT_ACTION_ID, (request) =>
      this.requireArticlesContentService().reviewDraft(
        request.input.item as ArticleGenerationWorkItem,
        readArticleWorkflowByok(request.runtimeContext),
      ),
    );
    runner.registerAction(ARTICLE_REVISE_DRAFT_ACTION_ID, (request) =>
      this.requireArticlesContentService().reviseDraft(
        request.input.state as ArticleGenerationReviewState,
        readArticleWorkflowByok(request.runtimeContext),
      ),
    );
    runner.registerAction(ARTICLE_PERSIST_DRAFT_ACTION_ID, ({ input }) =>
      this.requireArticlesContentService().persistDraft(
        input.state as ArticleGenerationRevisionState,
        this.createArticle.bind(this),
      ),
    );
    runner.registerAction(ARTICLE_FINALIZE_GENERATION_ACTION_ID, ({ input }) =>
      finalizeArticleGeneration(input),
    );
    runner.registerAction(
      ARTICLE_HEADER_PROMPT_ACTION_IDS.LOAD,
      ({ context, input }) =>
        this.loadArticleHeaderPrompt(
          input.request as { articleId: string },
          context.organizationId,
        ),
    );
    runner.registerAction(
      ARTICLE_HEADER_PROMPT_ACTION_IDS.GENERATE,
      (request) =>
        this.generateArticleHeaderPrompt(
          request.input.state as ArticleHeaderPromptState,
          readArticleWorkflowByok(request.runtimeContext),
        ),
    );
    runner.registerAction(
      ARTICLE_HEADER_PROMPT_ACTION_IDS.PERSIST,
      ({ input }) =>
        this.persistArticleHeaderPrompt(
          input.state as ArticleHeaderPromptState,
        ),
    );
    runner.registerAction(
      ARTICLE_INVALIDATE_GENERATION_ACTION_ID,
      ({ input }) =>
        this.invalidateGeneratedArticleCaches(
          input.state as ArticleGenerationFinalState,
        ),
    );
    runner.registerWorkflow(buildArticleGenerationWorkflowDefinition());
    runner.registerWorkflow(articleGenerationChildWorkflow());
    runner.registerWorkflow(articleReviewWorkflow());
    runner.registerWorkflow(ARTICLE_HEADER_PROMPT_WORKFLOW_DEFINITION);
    runner.registerAction(ARTICLE_LOAD_REVIEW_ACTION_ID, ({ context, input }) =>
      this.loadArticleReviewContext(
        requiredString(input.articleId, 'articleId'),
        context.userId,
        context.organizationId,
        typeof input.focus === 'string' ? input.focus : undefined,
      ),
    );
    runner.registerAction(ARTICLE_REVIEW_ACTION_ID, (request) =>
      this.requireArticlesContentService().reviewExistingPrepared(
        request.input.state as ArticleExistingReviewContext,
        readArticleWorkflowByok(request.runtimeContext),
      ),
    );
  }

  private async invalidateArticleListCaches(
    context: string,
    options: {
      includePublic?: boolean;
      organizationId?: string;
      articleId?: string;
    } = {},
  ): Promise<void> {
    return invalidateArticleListCaches(context, options, {
      cacheInvalidationService: this.cacheInvalidationService,
      cacheService: this.cacheService,
      collectionName: this.collectionName,
      logger: this.logger,
      source: this.constructorName,
    });
  }

  @HandleErrors('create article', 'articles')
  async createArticle(
    createArticleDto: CreateArticleDto,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<ArticleDocument> {
    this.logger.debug(`${this.constructorName} create`, { createArticleDto });

    assertArticleOwnershipIds(userId, organizationId, brandId);

    // `tags` is a Tag[] relation, not a scalar column — Prisma create rejects a
    // raw string[] (#2870). Convert tag IDs into a nested `connect` write.
    const { tags, ...scalarDto } = createArticleDto;
    const articleData = ArticleFilterUtil.toArticlePersistenceData({
      ...scalarDto,
      brandId,
      organizationId,
      userId,
    });

    if (articleData.status === 'PUBLISHED') {
      await assertPublicSlugAvailable(this.delegate, articleData.slug);
    }

    const result = await mapPublicSlugConflict(() =>
      super.create({
        ...articleData,
        ...(tags && tags.length > 0
          ? { tags: { connect: tags.map((id) => ({ id })) } }
          : {}),
      } as CreateArticleDto),
    );

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

    assertArticleOwnershipIds(userId, organizationId, brandId);

    const result = await super.findOne(
      scopedWhere(organizationId, {
        id,
        brandId,
        OR: [{ userId }, { scope: 'ORGANIZATION' }],
      }),
    );

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
        where: scopedWhere(organizationId, {
          brandId,
          slug,
          OR: [{ userId }, { scope: 'ORGANIZATION' }],
        }),
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

      assertArticleOwnershipIds(userId, organizationId, brandId);
      const accessible = await this.delegate.findFirst({
        where: scopedWhere(organizationId, {
          id,
          brandId,
          OR: [{ userId }, { scope: 'ORGANIZATION' }],
        }),
      });
      if (!accessible) throw new NotFoundException('Article', id);

      const updateData = ArticleFilterUtil.toArticlePersistenceData({
        ...updateArticleDto,
      });

      // `toArticlePersistenceData` normalizes legacy inputs (`public`, lowercase
      // spellings) to the persisted PUBLISHED label, so the raw DTO value is not
      // a reliable publish signal. Branch on the normalized status instead —
      // comparing the raw DTO lets a legacy update persist PUBLISHED while
      // silently skipping scope, publishedAt, and the Discord notification.
      const isPublishingUpdate = ArticleFilterUtil.isPublicArticleStatus(
        updateArticleDto.status,
      );

      // If status is being changed to PUBLISHED, handle publishing logic
      if (isPublishingUpdate) {
        await this.applyPublishStateTransition({
          id,
          organizationId,
          publishedAtFromDto: updateArticleDto.publishedAt,
          updateData,
          userId,
        });
      }

      await assertPublishedSlugTransition(
        this.delegate,
        id,
        updateData,
        accessible,
      );

      const result = await mapPublicSlugConflict(() =>
        super.patch(id, updateData),
      );

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
      await sendArticlePublishedNotification(
        {
          activityRecorder: this.activityRecorder,
          configService: this.configService,
          publicArticleScope: this.publicArticleScope,
          logger: this.logger,
          organizationSettingsService: this.organizationSettingsService,
          source: this.constructorName,
        },
        result,
        organizationId,
        isPublishingUpdate,
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

  async removeArticle(
    id: string,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    try {
      this.logger.debug(`${this.constructorName} remove`, { id });

      assertArticleOwnershipIds(userId, organizationId, brandId);

      // First verify the article exists and belongs to the user
      const article = await super.findOne(
        scopedWhere(organizationId, { id, brandId, userId }),
      );

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
      ...(await this.publicArticleScope.buildWhere()),
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
    previewArticleId: string | null = null,
  ): Promise<Article | null> {
    const where = await this.publicArticleScope.buildSlugWhere(
      slug,
      previewArticleId,
    );

    // The partial unique index guarantees one published article per slug; the
    // explicit order keeps the answer deterministic (earliest release first)
    // even if a legacy duplicate survives.
    const article = await this.delegate.findFirst({
      orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      where,
    });

    if (!article) {
      return null;
    }

    // Application-level join for cross-DB refs (user + organization live in auth DB)
    const articleObj = { ...article } as Record<string, unknown>;
    await this.hydrateUserAndOrganization([articleObj]);

    return articleObj as unknown as Article;
  }

  /**
   * Generate articles through the article workflow. `byok` rides the
   * non-persisted `runtimeContext`, never `inputValues` (#5380).
   */
  async generateArticles(
    generateDto: GenerateArticlesDto,
    userId: string,
    organizationId: string,
    brandId: string,
    byok?: TextByokDispatch,
  ): Promise<ArticleGenerationActionResult> {
    const { result } =
      await this.requireWorkflowRunner().runWorkflow<ArticleGenerationActionResult>(
        {
          actionType: ARTICLE_GENERATION_TOOL_ID,
          canonicalId: ARTICLE_GENERATION_WORKFLOW_ID,
          inputValues: { brandId, dto: generateDto },
          metadata: { brandId, origin: 'api' },
          organizationId,
          runtimeContext: articleWorkflowRuntime(byok),
          source: 'ArticlesService.generateArticles',
          trigger: WorkflowExecutionTrigger.API,
          userId,
        },
      );
    return result;
  }

  private async loadArticleHeaderPrompt(
    request: { articleId: string },
    organizationId: string,
  ): Promise<ArticleHeaderPromptState> {
    const articleId = requiredString(request.articleId, 'articleId');
    const article = await this.findOne({
      id: articleId,
      isDeleted: false,
      organizationId,
    });
    if (!article) throw new NotFoundException('Article', articleId);
    return { article, articleId, organizationId };
  }

  private async generateArticleHeaderPrompt(
    state: ArticleHeaderPromptState,
    byok?: TextByokDispatch,
  ): Promise<ArticleHeaderPromptState> {
    return {
      ...state,
      prompt: await this.articleInsightsService.generateHeaderPrompt(
        state.article,
        state.organizationId,
        byok,
      ),
    };
  }

  private async persistArticleHeaderPrompt(
    state: ArticleHeaderPromptState,
  ): Promise<string> {
    const prompt = requiredString(state.prompt, 'prompt');
    await this.patch(state.articleId, { generationPrompt: prompt });
    return prompt;
  }

  private async invalidateGeneratedArticleCaches(
    state: ArticleGenerationFinalState,
  ): Promise<ArticleGenerationActionResult> {
    if (this.cacheService) {
      const collectionName = this.collectionName;
      await invalidateCollectionQueryCache(this.cacheService, collectionName);
      await invalidateAllPaginatedQueryCaches(this.cacheService);
      await this.cacheService.invalidateByTags([
        'articles',
        `collection:${collectionName}`,
        `query:${collectionName}`,
        paginatedQueryCacheTag(collectionName),
      ]);
    }
    return { articles: state.articles, billedCredits: state.billedCredits };
  }

  async reviewArticle(
    articleId: string,
    userId: string,
    organizationId: string,
    focus?: string,
    byok?: TextByokDispatch,
  ): Promise<ArticleReviewActionResult> {
    const { result } =
      await this.requireWorkflowRunner().runWorkflow<ArticleReviewActionResult>(
        {
          actionType: ARTICLE_REVIEW_ACTION_ID,
          canonicalId: ARTICLE_REVIEW_WORKFLOW_ID,
          inputValues: { articleId, focus },
          metadata: { origin: 'api' },
          organizationId,
          runtimeContext: articleWorkflowRuntime(byok),
          source: 'ArticlesService.reviewArticle',
          trigger: WorkflowExecutionTrigger.API,
          userId,
        },
      );
    return result;
  }

  private async loadArticleReviewContext(
    articleId: string,
    userId: string,
    organizationId: string,
    focus?: string,
  ): Promise<ArticleExistingReviewContext> {
    const article = await this.findOne({
      id: articleId,
      OR: [{ userId }, { organizationId }],
    });

    if (!article) {
      throw new NotFoundException('Article');
    }

    const modelConfig =
      await this.resolveArticleCycleModelConfig(organizationId);
    return this.requireArticlesContentService().prepareExistingReview(
      article,
      organizationId,
      modelConfig,
      focus,
    );
  }

  /**
   * Resolves the three text models an article cycle runs on.
   *
   * `generationModelOverride` is the per-request model (`GenerateArticlesDto.model`,
   * which the agent orchestrator fills from `agentPolicy.generationModelOverride`)
   * and follows the same explicit > org default > system default precedence the
   * image/video paths use. Only the generation step is overridden — review and
   * update keep their configured models.
   */
  async resolveArticleCycleModelConfig(
    organizationId: string,
    generationModelOverride?: string,
  ): Promise<ArticleCycleModelConfig> {
    // The Admin default TEXT model (#5161) replaces the seed constant as the
    // system default; explicit and org-configured models still win.
    const systemDefault =
      (await this.agentChatModelRegistry?.resolveModelKey(
        undefined,
        DEFAULT_TEXT_MODEL,
      )) ?? DEFAULT_TEXT_MODEL;
    const settings = await this.organizationSettingsService?.findOne(
      scopedWhere(organizationId, {}),
    );

    return {
      generationModel: resolveGenerationDefaultModel<string>({
        explicit: generationModelOverride,
        organizationDefault: settings?.defaultModel,
        systemDefault,
      }),
      reviewModel: settings?.defaultModelReview || DEFAULT_MINI_TEXT_MODEL,
      updateModel: settings?.defaultModelUpdate || DEFAULT_MINI_TEXT_MODEL,
    };
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
    });

    if (!article) {
      throw new NotFoundException('Article');
    }

    return this.articlesContentService.convertToTwitterThread(
      article,
      this.publicArticleScope,
    );
  }

  /** Analyze article virality potential using AI */
  analyzeVirality(
    articleId: string,
    userId: string,
    organizationId: string,
    _brandId: string,
    byokApiKeyOverride?: string,
  ): Promise<ViralityAnalysisResponse> {
    return this.articleInsightsService.analyzeVirality(
      articleId,
      userId,
      organizationId,
      (criteria) => this.findOne(criteria),
      (id, updates) => this.patch(id, updates),
      byokApiKeyOverride,
    );
  }

  /** Update article performance metrics. */
  updatePerformanceMetrics(
    articleId: string,
    organizationId: string,
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
      organizationId,
      metrics,
    );
  }

  @HandleErrors('generate article header prompt', 'articles')
  async generateHeaderPrompt(
    articleId: string,
    userId: string,
    organizationId: string,
    byok?: TextByokDispatch,
  ): Promise<string> {
    const { result } = await this.requireWorkflowRunner().runWorkflow<string>({
      actionType: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
      canonicalId: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
      inputValues: { request: { articleId } },
      organizationId,
      runtimeContext: articleWorkflowRuntime(byok),
      source: 'ArticlesService.generateHeaderPrompt',
      trigger: WorkflowExecutionTrigger.API,
      userId,
    });
    return result;
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

  private requireWorkflowRunner(): SystemWorkflowRunnerService {
    if (!this.moduleRef) {
      throw new Error('Workflow action runner is unavailable');
    }
    return this.moduleRef.get(SystemWorkflowRunnerService, { strict: false });
  }

  private requireArticlesContentService(): ArticlesContentService {
    if (!this.articlesContentService) {
      throw new Error('ArticlesContentService not available');
    }
    return this.articlesContentService;
  }

  private async hydrateUserAndOrganization(
    docs: Array<Record<string, unknown>>,
  ): Promise<void> {
    return hydrateArticleReferences(docs, {
      usersService: this.usersService,
      organizationsService: this.organizationsService,
    });
  }
}
