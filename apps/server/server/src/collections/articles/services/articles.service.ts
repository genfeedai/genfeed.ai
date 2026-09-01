import { createGenfeedActionNode } from '@genfeedai/actions';
import { ArticleScope, WorkflowExecutionTrigger } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
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
import { ViralityAnalysisResponse } from '@server/collections/articles/dto/analyze-virality.dto';
import { TwitterThreadResponse } from '@server/collections/articles/dto/article-to-thread.dto';
import { ArticlesQueryDto } from '@server/collections/articles/dto/articles-query.dto';
import { CreateArticleDto } from '@server/collections/articles/dto/create-article.dto';
import {
  ArticleGenerationType,
  GenerateArticlesDto,
} from '@server/collections/articles/dto/generate-articles.dto';
import { UpdateArticleDto } from '@server/collections/articles/dto/update-article.dto';
import {
  type Article,
  type ArticleDocument,
} from '@server/collections/articles/schemas/article.schema';
import {
  ARTICLE_HEADER_PROMPT_ACTION_IDS,
  ARTICLE_HEADER_PROMPT_WORKFLOW_DEFINITION,
  ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
} from '@server/collections/articles/services/article-header-prompt-workflow-definition';
import { ArticleInsightsService } from '@server/collections/articles/services/article-insights.service';
import { ArticleRemixService } from '@server/collections/articles/services/article-remix.service';
import { ArticleVersionService } from '@server/collections/articles/services/article-version.service';
import type {
  ArticleCycleModelConfig,
  ArticleExistingReviewContext,
  ArticleGenerationContext,
  ArticleGenerationReviewState,
  ArticleGenerationRevisionState,
  ArticleGenerationWorkItem,
  ArticleReviewRubric,
} from '@server/collections/articles/services/articles-content.service';
import { ArticlesContentService } from '@server/collections/articles/services/articles-content.service';
import {
  assertArticleOwnershipIds,
  readNonEmptyString,
} from '@server/collections/articles/utils/article-input-boundary.util';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@server/collections/organizations/services/organizations.service';
import { UsersService } from '@server/collections/users/services/users.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@server/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@server/common/services/cache-invalidation.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@server/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@server/constants/default-text-model.constant';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { HandleErrors } from '@server/helpers/decorators/error-handler.decorator';
import { ArticleFilterUtil } from '@server/helpers/utils/article-filter/article-filter.util';
import { resolveGenerationDefaultModel } from '@server/helpers/utils/generation-defaults/generation-defaults.util';
import { CacheService } from '@server/services/cache/cache.service';
import { NotificationsService } from '@server/services/notifications/notifications.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';
import { findOrThrow } from '@server/shared/utils/find-or-throw/find-or-throw.util';
import {
  invalidateAllPaginatedQueryCaches,
  invalidateCollectionQueryCache,
  paginatedQueryCacheTag,
} from '@server/shared/utils/query-cache/query-cache.util';

export const ARTICLE_GENERATION_TOOL_ID = 'create_article';
export const ARTICLE_REVIEW_ACTION_ID = 'article.review';
const ARTICLE_FINALIZE_GENERATION_ACTION_ID = 'article.generation.finalize';
const ARTICLE_GENERATE_DRAFTS_ACTION_ID = 'article.generation.generate-drafts';
const ARTICLE_INVALIDATE_GENERATION_ACTION_ID =
  'article.generation.invalidate-cache';
const ARTICLE_LOAD_GENERATION_ACTION_ID = 'article.generation.load-context';
const ARTICLE_PERSIST_DRAFT_ACTION_ID = 'article.generation.persist-draft';
const ARTICLE_REVISE_DRAFT_ACTION_ID = 'article.generation.revise-draft';
const ARTICLE_REVIEW_DRAFT_ACTION_ID = 'article.generation.review-draft';
const ARTICLE_LOAD_REVIEW_ACTION_ID = 'article.review.load-context';
const ARTICLE_GENERATION_WORKFLOW_ID = 'article.generation';
const ARTICLE_GENERATION_CHILD_WORKFLOW_ID = 'article.generation.one';
const ARTICLE_REVIEW_WORKFLOW_ID = 'article.review.workflow';

export function buildArticleGenerationWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ARTICLE_GENERATION_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-generate',
          source: 'load-context',
          target: 'generate-drafts',
          targetHandle: 'state',
        },
        {
          id: 'generate-items',
          source: 'generate-drafts',
          sourceHandle: 'items',
          target: 'process-drafts',
          targetHandle: 'items',
        },
        {
          id: 'generate-finalize',
          source: 'generate-drafts',
          target: 'finalize-generation',
          targetHandle: 'generation',
        },
        {
          id: 'drafts-finalize',
          source: 'process-drafts',
          target: 'finalize-generation',
          targetHandle: 'drafts',
        },
        {
          id: 'finalize-header',
          source: 'finalize-generation',
          sourceHandle: 'headerPromptItems',
          target: 'generate-header-prompts',
          targetHandle: 'items',
        },
        {
          id: 'finalize-invalidate',
          source: 'finalize-generation',
          target: 'invalidate-cache',
          targetHandle: 'state',
        },
        {
          id: 'header-invalidate',
          source: 'generate-header-prompts',
          target: 'invalidate-cache',
          targetHandle: 'headerPrompts',
        },
        {
          id: 'header-failure-invalidate',
          source: 'generate-header-prompts',
          sourceHandle: 'failure',
          target: 'invalidate-cache',
          targetHandle: 'headerFailure',
        },
      ],
      inputVariables: [
        { key: 'dto', label: 'Article request', required: true, type: 'json' },
        { key: 'brandId', label: 'Brand', required: true, type: 'string' },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ARTICLE_LOAD_GENERATION_ACTION_ID,
          id: 'load-context',
          inputVariableKeys: ['dto', 'brandId'],
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_GENERATE_DRAFTS_ACTION_ID,
          id: 'generate-drafts',
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'process-drafts',
          parameters: {
            childWorkflowId: ARTICLE_GENERATION_CHILD_WORKFLOW_ID,
            itemInputKey: 'item',
            maxConcurrency: 3,
            mode: 'await',
          },
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_FINALIZE_GENERATION_ACTION_ID,
          id: 'finalize-generation',
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'generate-header-prompts',
          parameters: {
            childWorkflowId: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
            itemInputKey: 'request',
            maxConcurrency: 1,
            mode: 'await',
          },
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_INVALIDATE_GENERATION_ACTION_ID,
          id: 'invalidate-cache',
        }),
      ],
    },
    description:
      'Loads generation context, generates drafts, and processes each article through review, revision, and persistence.',
    label: 'Article Generation',
    resultNodeId: 'invalidate-cache',
    version: 1,
  };
}

function articleGenerationChildWorkflow(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ARTICLE_GENERATION_CHILD_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'review-revise',
          source: 'review-draft',
          target: 'revise-draft',
          targetHandle: 'state',
        },
        {
          id: 'revise-persist',
          source: 'revise-draft',
          target: 'persist-draft',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        { key: 'item', label: 'Article draft', required: true, type: 'json' },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ARTICLE_REVIEW_DRAFT_ACTION_ID,
          id: 'review-draft',
          inputVariableKeys: ['item'],
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_REVISE_DRAFT_ACTION_ID,
          id: 'revise-draft',
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_PERSIST_DRAFT_ACTION_ID,
          id: 'persist-draft',
        }),
      ],
    },
    description: 'Reviews, revises, and persists one generated article draft.',
    label: 'Generate One Article',
    resultNodeId: 'persist-draft',
    version: 1,
  };
}

function articleReviewWorkflow(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: ARTICLE_REVIEW_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-review',
          source: 'load-context',
          target: 'review-article',
          targetHandle: 'state',
        },
      ],
      inputVariables: [
        { key: 'articleId', label: 'Article', required: true, type: 'string' },
        {
          key: 'focus',
          label: 'Review focus',
          required: false,
          type: 'string',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: ARTICLE_LOAD_REVIEW_ACTION_ID,
          id: 'load-context',
          inputVariableKeys: ['articleId', 'focus'],
        }),
        createGenfeedActionNode({
          actionId: ARTICLE_REVIEW_ACTION_ID,
          id: 'review-article',
        }),
      ],
    },
    description: 'Loads article context and generates a structured review.',
    label: 'Article Review',
    resultNodeId: 'review-article',
    version: 1,
  };
}

export type ArticleGenerationActionResult = {
  articles: ArticleDocument[];
  billedCredits: number;
};

type ArticleGenerationFinalState = ArticleGenerationActionResult & {
  context: ArticleGenerationContext;
  headerPromptItems: Array<{ articleId: string }>;
};

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

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly articleVersionService: ArticleVersionService,
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
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    super(prisma, 'article', logger, undefined, cacheService);
  }

  onModuleInit(): void {
    const runner = this.requireWorkflowRunner();
    runner.registerAction(
      ARTICLE_LOAD_GENERATION_ACTION_ID,
      async ({ context, input }) => {
        const dto = this.readArticleGenerationInput(input.dto);
        const brandId = this.requiredString(input.brandId, 'brandId');
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
    runner.registerAction(ARTICLE_GENERATE_DRAFTS_ACTION_ID, ({ input }) =>
      this.requireArticlesContentService().generateDrafts(
        input.state as ArticleGenerationContext,
      ),
    );
    runner.registerAction(ARTICLE_REVIEW_DRAFT_ACTION_ID, ({ input }) =>
      this.requireArticlesContentService().reviewDraft(
        input.item as ArticleGenerationWorkItem,
      ),
    );
    runner.registerAction(ARTICLE_REVISE_DRAFT_ACTION_ID, ({ input }) =>
      this.requireArticlesContentService().reviseDraft(
        input.state as ArticleGenerationReviewState,
      ),
    );
    runner.registerAction(ARTICLE_PERSIST_DRAFT_ACTION_ID, ({ input }) =>
      this.requireArticlesContentService().persistDraft(
        input.state as ArticleGenerationRevisionState,
        this.createArticle.bind(this),
      ),
    );
    runner.registerAction(ARTICLE_FINALIZE_GENERATION_ACTION_ID, ({ input }) =>
      this.finalizeArticleGeneration(input),
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
      ({ input }) =>
        this.generateArticleHeaderPrompt(
          input.state as ArticleHeaderPromptState,
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
        this.requiredString(input.articleId, 'articleId'),
        context.userId,
        context.organizationId,
        typeof input.focus === 'string' ? input.focus : undefined,
      ),
    );
    runner.registerAction(ARTICLE_REVIEW_ACTION_ID, ({ input }) =>
      this.requireArticlesContentService().reviewExistingPrepared(
        input.state as ArticleExistingReviewContext,
      ),
    );
  }

  /**
   * Invalidate the article cache after a write.
   * Single home for the tag block previously copy-pasted across
   * createArticle/update/removeArticle.
   *
   * Busts two layers: (1) the canonical `articles:list:{orgId}` /
   * `articles:single:{id}` keys plus the shared `articles` tag via
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
      // Bust org/user-scoped @Cache responses registered under the shared
      // articles tag at set time. Idempotent with the CacheService tag pass
      // below — both run so each optional dependency stays self-sufficient.
      await this.cacheInvalidationService.invalidateByTags([
        CACHE_TAGS.ARTICLES,
      ]);
    }

    if (!this.cacheService) {
      return;
    }

    const collectionName = this.collectionName;
    const tagsToInvalidate = [
      CACHE_TAGS.ARTICLES,
      collectionName,
      `collection:${collectionName}`,
      `query:${collectionName}`,
      paginatedQueryCacheTag(collectionName),
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

    const result = await super.create({
      ...articleData,
      ...(tags && tags.length > 0
        ? { tags: { connect: tags.map((id) => ({ id })) } }
        : {}),
    } as CreateArticleDto);

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
      scopedWhere(organizationId, { id, brandId, userId }),
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
        where: scopedWhere(organizationId, { brandId, slug, userId }),
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

  /**
   * Send a Discord notification when an article was just published.
   * No-op unless the update normalized to PUBLISHED, the supporting services are
   * wired, and the organization has Discord notifications enabled. Never throws —
   * a failed notification must not fail the update. Extracted from `update`.
   *
   * Takes the already-normalized publish signal rather than the raw DTO status so
   * legacy `public` input notifies exactly like canonical `PUBLISHED` input.
   */
  private async sendArticlePublishedNotification(
    result: ArticleDocument,
    organizationId: string,
    isPublishingUpdate: boolean,
  ): Promise<void> {
    if (
      !isPublishingUpdate ||
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
      // `articles.label` is NOT NULL, so the update result always carries it.
      const articleLabel = String(result.label);
      const articleSlug = readNonEmptyString(result.slug) ?? result.id;

      await this.notificationsService.sendArticleNotification({
        category: readNonEmptyString(result.category),
        label: articleLabel,
        publicUrl,
        slug: articleSlug,
        summary: readNonEmptyString(result.summary),
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
      ...ArticleFilterUtil.buildPublicArticleVisibilityFilter(),
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
      Object.assign(
        where,
        ArticleFilterUtil.buildPublicArticleVisibilityFilter(),
      );
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
  ): Promise<ArticleGenerationActionResult> {
    const { result } =
      await this.requireWorkflowRunner().runWorkflow<ArticleGenerationActionResult>(
        {
          actionType: ARTICLE_GENERATION_TOOL_ID,
          canonicalId: ARTICLE_GENERATION_WORKFLOW_ID,
          inputValues: { brandId, dto: generateDto },
          metadata: { brandId, origin: 'api' },
          organizationId,
          source: 'ArticlesService.generateArticles',
          trigger: WorkflowExecutionTrigger.API,
          userId,
        },
      );
    return result;
  }

  private finalizeArticleGeneration(
    input: Record<string, unknown>,
  ): ArticleGenerationFinalState {
    const generation = input.generation as {
      billedCredits: number;
      context: ArticleGenerationContext;
    };
    const drafts = input.drafts as {
      results?: Array<{
        result?: { article?: ArticleDocument; billedCredits?: number };
      }>;
    };
    const completed = drafts.results ?? [];
    const articles = completed.flatMap(({ result }) =>
      result?.article ? [result.article] : [],
    );
    return {
      articles,
      billedCredits:
        generation.billedCredits +
        completed.reduce(
          (total, { result }) => total + (result?.billedCredits ?? 0),
          0,
        ),
      context: generation.context,
      headerPromptItems:
        generation.context.generationType === ArticleGenerationType.X_ARTICLE &&
        generation.context.generateDto.generateHeaderImage !== false &&
        articles[0]
          ? [{ articleId: articles[0].id }]
          : [],
    };
  }

  private async loadArticleHeaderPrompt(
    request: { articleId: string },
    organizationId: string,
  ): Promise<ArticleHeaderPromptState> {
    const articleId = this.requiredString(request.articleId, 'articleId');
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
  ): Promise<ArticleHeaderPromptState> {
    return {
      ...state,
      prompt: await this.articleInsightsService.generateHeaderPrompt(
        state.article,
        state.organizationId,
      ),
    };
  }

  private async persistArticleHeaderPrompt(
    state: ArticleHeaderPromptState,
  ): Promise<string> {
    const prompt = this.requiredString(state.prompt, 'prompt');
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
  ): Promise<ArticleReviewActionResult> {
    const { result } =
      await this.requireWorkflowRunner().runWorkflow<ArticleReviewActionResult>(
        {
          actionType: ARTICLE_REVIEW_ACTION_ID,
          canonicalId: ARTICLE_REVIEW_WORKFLOW_ID,
          inputValues: { articleId, focus },
          metadata: { origin: 'api' },
          organizationId,
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
    if (!this.organizationSettingsService) {
      return {
        generationModel: resolveGenerationDefaultModel<string>({
          explicit: generationModelOverride,
          systemDefault: DEFAULT_TEXT_MODEL,
        }),
        reviewModel: DEFAULT_MINI_TEXT_MODEL,
        updateModel: DEFAULT_MINI_TEXT_MODEL,
      };
    }

    const settings = await this.organizationSettingsService.findOne(
      scopedWhere(organizationId, {}),
    );

    return {
      generationModel: resolveGenerationDefaultModel<string>({
        explicit: generationModelOverride,
        organizationDefault: settings?.defaultModel,
        systemDefault: DEFAULT_TEXT_MODEL,
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

  @HandleErrors('generate article header prompt', 'articles')
  async generateHeaderPrompt(
    articleId: string,
    userId: string,
    organizationId: string,
  ): Promise<string> {
    const { result } = await this.requireWorkflowRunner().runWorkflow<string>({
      actionType: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
      canonicalId: ARTICLE_HEADER_PROMPT_WORKFLOW_ID,
      inputValues: { request: { articleId } },
      organizationId,
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

  private readArticleGenerationInput(value: unknown): GenerateArticlesDto {
    const input = this.readRecord(value);
    const nested = this.readRecord(input.dto);
    const source = Object.keys(nested).length > 0 ? nested : input;
    const prompt = this.requiredString(source.prompt ?? source.topic, 'prompt');
    const length =
      typeof source.length === 'string' ? source.length : undefined;
    const targetWordCount =
      typeof source.targetWordCount === 'number'
        ? source.targetWordCount
        : length === 'long'
          ? 7_000
          : length === 'short'
            ? 2_500
            : length
              ? 4_000
              : undefined;
    const brandId =
      typeof source.brandId === 'string' ? source.brandId : undefined;
    const keywords = Array.isArray(source.keywords)
      ? source.keywords.filter(
          (keyword): keyword is string => typeof keyword === 'string',
        )
      : undefined;
    const tone = typeof source.tone === 'string' ? source.tone : undefined;
    const normalizedSource = { ...source };
    delete normalizedSource.brandId;
    delete normalizedSource.count;
    delete normalizedSource.keywords;
    delete normalizedSource.prompt;
    delete normalizedSource.targetWordCount;
    delete normalizedSource.tone;

    return {
      ...normalizedSource,
      ...(brandId === undefined ? {} : { brandId }),
      count: typeof source.count === 'number' ? source.count : 1,
      ...(keywords === undefined ? {} : { keywords }),
      prompt,
      ...(targetWordCount === undefined ? {} : { targetWordCount }),
      ...(tone === undefined ? {} : { tone }),
    } as GenerateArticlesDto;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Missing required article action input: ${field}`);
    }
    return value.trim();
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
      ...new Set(docs.map((d) => d.userId?.toString()).filter(Boolean)),
    ] as string[];
    const orgIds = [
      ...new Set(docs.map((d) => d.organizationId?.toString()).filter(Boolean)),
    ] as string[];

    // Scope by id. Never load the full users/orgs tables — that is both an
    // availability hazard (full-table findMany) and a schema-drift amplifier:
    // production dropped `users.authProviderId` while older clients still
    // projected every user row (Sentry API-GENFEED-AI-65 / #2185).
    const [users, orgs] = await Promise.all([
      this.usersService && userIds.length > 0
        ? this.usersService
            .findAll(
              {
                where: {
                  id: { in: userIds },
                  isDeleted: false,
                },
              },
              { pagination: false },
            )
            .then((result) => result.docs as Array<Record<string, unknown>>)
        : Promise.resolve([] as Array<Record<string, unknown>>),
      this.organizationsService && orgIds.length > 0
        ? this.organizationsService
            .findAll(
              {
                where: {
                  id: { in: orgIds },
                  isDeleted: false,
                },
              },
              { pagination: false },
            )
            .then((result) => result.docs as Array<Record<string, unknown>>)
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);

    const usersMap = new Map(
      users.map((u: Record<string, unknown>) => [String(u.id), u]),
    );
    const orgsMap = new Map(
      orgs.map((o: Record<string, unknown>) => [String(o.id), o]),
    );

    for (const doc of docs) {
      const docUserId = doc.userId?.toString();
      const docOrgId = doc.organizationId?.toString();
      if (docUserId && usersMap.has(docUserId)) {
        doc.user = usersMap.get(docUserId);
      }
      if (docOrgId && orgsMap.has(docOrgId)) {
        doc.organization = orgsMap.get(docOrgId);
      }
    }
  }
}
