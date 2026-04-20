import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import { CreateRemixArticleDto } from '@api/collections/articles/dto/create-remix-article.dto';
import {
  ArticleGenerationType,
  EditArticleWithAIDto,
  GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { ReviewArticleDto } from '@api/collections/articles/dto/review-article.dto';
import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import {
  Article,
  type ArticleDocument,
} from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { RouterService } from '@api/services/router/router.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ModelCategory,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { ArticleSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('articles')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class ArticlesController extends BaseCRUDController<
  ArticleDocument,
  CreateArticleDto,
  UpdateArticleDto,
  ArticlesQueryDto
> {
  private static readonly ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    public readonly articlesService: ArticlesService,
    private readonly activitiesService: ActivitiesService,
    private readonly websocketService: NotificationsPublisherService,
    public readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    public readonly loggerService: LoggerService,
    public readonly routerService: RouterService,
  ) {
    // ArticleSerializer would need to be created, using null for now
    super(loggerService, articlesService, ArticleSerializer, 'Article', [
      'user',
      'organization',
      'brand',
      'tags',
    ]);
  }

  /**
   * Override buildFindAllPipeline to include organization and brand filtering
   * Uses ArticleFilterUtil for consistent filtering patterns
   */
  public buildFindAllPipeline(
    user: User,
    query: ArticlesQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);

    return ArticleFilterUtil.buildArticlePipeline(
      {
        category: query.category,
        scope: query.scope,
        search: query.search,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        status: query.status,
        tag: query.tag,
      },
      {
        brand: publicMetadata.brand,
        isDeleted: query.isDeleted ?? false,
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
    );
  }

  // Inherits create(), findAll(), and remove(:id) from BaseCRUDController

  /**
   * Override findOne to include evaluation lookup
   */
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') articleId: string,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Build aggregation pipeline to fetch article with evaluation
    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          _id: articleId,
          isDeleted: false,
        },
      },
      // Lookup latest COMPLETED evaluation for this article (full document)
      {
        $lookup: {
          as: 'evaluation',
          from: 'evaluations',
          let: { articleId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$content', '$$articleId'] },
                contentType: 'article',
                isDeleted: false,
                status: 'COMPLETED',
              },
            },
            { $sort: { updatedAt: -1 } },
            { $limit: 1 },
            // NO $project - include full evaluation document
          ],
        },
      },
      // Flatten evaluation to single object (or null)
      {
        $addFields: {
          evaluation: {
            $ifNull: [{ $arrayElemAt: ['$evaluation', 0] }, null],
          },
        },
      },
    ];

    // Execute aggregation using service's findAll method
    const results = await this.articlesService.findAll(pipeline, {
      pagination: false,
    });

    if (!results || !results.docs || results.docs.length === 0) {
      ErrorResponse.notFound(this.entityName, articleId);
    }

    const article = results.docs[0];

    // Check organization access
    if (
      article.organization.toString() !==
        publicMetadata.organization.toString() &&
      !getIsSuperAdmin(user, request)
    ) {
      ErrorResponse.notFound(this.entityName, articleId);
    }

    return serializeSingle(request, this.serializer, article);
  }

  /**
   * Override patch to use ArticlesService.update() which handles publishing logic
   */
  @Patch(':articleId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('articleId') articleId: string,
    @Body() updateDto: UpdateArticleDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const data: ArticleDocument = await this.articlesService.update(
      articleId,
      updateDto,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    return serializeSingle(request, this.serializer, data);
  }

  @Get('slug/:slug')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  findBySlug(@Param('slug') slug: string, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);

    return this.articlesService.findBySlug(
      slug,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );
  }

  @Post('generations')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Article generation (text model bundle)',
    source: ActivitySource.ARTICLE_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateArticles(
    @Req() request: Request,
    @Body() dto: GenerateArticlesDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const generationType = dto.type || ArticleGenerationType.STANDARD;
    const isXArticle = generationType === ArticleGenerationType.X_ARTICLE;

    // Check if article generation is enabled for this organization
    const orgSettings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (orgSettings && !orgSettings.isGenerateArticlesEnabled) {
      throw new ForbiddenException(
        'Article generation is not enabled for this organization',
      );
    }

    const modelConfig =
      await this.articlesService.resolveArticleCycleModelConfig(
        publicMetadata.organization,
      );
    const minimumRequiredCredits = (
      await Promise.all([
        this.getTextModelMinimumCredits(modelConfig.generationModel),
        this.getTextModelMinimumCredits(modelConfig.reviewModel),
        this.getTextModelMinimumCredits(modelConfig.updateModel),
      ])
    ).reduce((sum, amount) => sum + amount, 0);

    await this.assertOrganizationCreditsAvailable(
      publicMetadata.organization,
      minimumRequiredCredits,
    );

    let billedCredits = 0;

    // Create activity for article generation start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: publicMetadata.brand,
        key: ActivityKey.ARTICLE_PROCESSING,
        organization: publicMetadata.organization,
        source: ActivitySource.ARTICLE_GENERATION,
        user: publicMetadata.user,
        value: JSON.stringify({
          count: dto.count || 1,
          prompt: dto.prompt?.substring(0, 100),
          type: generationType,
        }),
      }),
    );

    // Emit background-task-update WebSocket event
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: isXArticle ? 'X Article Generation' : 'Article Generation',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: activity._id.toString(),
      userId: user.id,
    });

    try {
      const articles = await this.articlesService.generateArticles(
        dto,
        publicMetadata.user,
        publicMetadata.organization,
        publicMetadata.brand,
        (amount) => {
          billedCredits += amount;
        },
      );

      const reqWithCredits = request as Request & {
        creditsConfig?: {
          amount?: number;
          deferred?: boolean;
          modelKey?: string;
          maxOverdraftCredits?: number;
        };
      };
      if (reqWithCredits.creditsConfig?.deferred) {
        reqWithCredits.creditsConfig = {
          ...reqWithCredits.creditsConfig,
          amount: billedCredits,
          deferred: false,
          maxOverdraftCredits:
            ArticlesController.ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS,
        };
      }

      // Create activities for each generated article
      for (const article of articles) {
        await this.activitiesService.create(
          new ActivityEntity({
            brand: publicMetadata.brand,
            entityId: article._id,
            entityModel: ActivityEntityModel.ARTICLE,
            key: ActivityKey.ARTICLE_GENERATED,
            organization: publicMetadata.organization,
            source: ActivitySource.ARTICLE_GENERATION,
            user: publicMetadata.user,
            value: article._id.toString(),
          }),
        );

        // Emit background-task-update WebSocket event for each article
        await this.websocketService.publishBackgroundTaskUpdate({
          activityId: activity._id.toString(),
          label: isXArticle ? 'X Article Generation' : 'Article Generation',
          progress: 100,
          resultId: article._id.toString(),
          room: getUserRoomName(user.id),
          status: 'completed',
          taskId: article._id.toString(),
          userId: user.id,
        });
      }

      if (isXArticle && articles[0]) {
        return serializeSingle(request, ArticleSerializer, articles[0]);
      }

      return serializeCollection(request, ArticleSerializer, {
        docs: articles,
      });
    } catch (error: unknown) {
      // Update activity to failed
      const errorMessage =
        (error as Error)?.message || 'Article generation failed';

      await this.activitiesService.patch(activity._id.toString(), {
        key: ActivityKey.ARTICLE_FAILED,
        value: JSON.stringify({
          error: errorMessage,
        }),
      });

      // Emit background-task-update WebSocket event for failure
      await this.websocketService.publishBackgroundTaskUpdate({
        activityId: activity._id.toString(),
        error: errorMessage,
        label: isXArticle ? 'X Article Generation' : 'Article Generation',
        room: getUserRoomName(user.id),
        status: 'failed',
        taskId: activity._id.toString(),
        userId: user.id,
      });

      throw error;
    }
  }

  @Post(':articleId/thread-conversions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async convertToThread(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    return await this.articlesService.convertToTwitterThread(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );
  }

  @Post(':articleId/virality-analyses')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Article virality analysis (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.ARTICLE_VIRALITY_ANALYSIS,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async analyzeVirality(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    return await this.articlesService.analyzeVirality(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );
  }

  /**
   * Edit article with AI
   */
  @Post(':articleId/enhancements')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Article enhancement (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.ARTICLE_ENHANCEMENT,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async editWithAI(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @Body() dto: EditArticleWithAIDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const updatedArticle = await this.articlesService.enhance(
      articleId,
      dto,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    return serializeSingle(request, ArticleSerializer, updatedArticle);
  }

  @Post(':articleId/reviews')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Article review (text model)',
    source: ActivitySource.ARTICLE_ENHANCEMENT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async reviewArticle(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @Body() dto: ReviewArticleDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const modelConfig =
      await this.articlesService.resolveArticleCycleModelConfig(
        publicMetadata.organization,
      );

    await this.assertOrganizationCreditsAvailable(
      publicMetadata.organization,
      await this.getTextModelMinimumCredits(modelConfig.reviewModel),
    );

    let billedCredits = 0;

    const review = await this.articlesService.reviewArticle(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      dto.focus,
      (amount) => {
        billedCredits += amount;
      },
    );

    const reqWithCredits = request as Request & {
      creditsConfig?: {
        amount?: number;
        deferred?: boolean;
        modelKey?: string;
        maxOverdraftCredits?: number;
      };
    };
    if (reqWithCredits.creditsConfig?.deferred) {
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        amount: billedCredits,
        deferred: false,
        maxOverdraftCredits:
          ArticlesController.ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS,
      };
    }

    return review;
  }

  private async assertOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<void> {
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

    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    throw new HttpException(
      {
        detail: `Insufficient credits: ${requiredCredits} required, ${balance} available`,
        title: 'Insufficient credits',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private async getTextModelMinimumCredits(modelKey?: string): Promise<number> {
    if (!modelKey) {
      return 0;
    }

    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(modelKey),
    });

    if (!model) {
      return 0;
    }

    if (model.pricingType === 'per-token') {
      return getMinimumTextCredits(model);
    }

    return model.cost || 0;
  }

  /**
   * Create a remix version of an existing article
   * Copies all content from original article with optional new title
   */
  @Post(':articleId/remixes')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createRemix(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @Body() dto: CreateRemixArticleDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    try {
      const remixArticle = await this.articlesService.createRemix(
        articleId,
        publicMetadata.user,
        publicMetadata.organization,
        publicMetadata.brand,
        {
          ...(dto.label && { label: `Remix: ${dto.label}` }),
          // instructions: dto.instructions,
        },
      );

      return serializeSingle(request, ArticleSerializer, remixArticle);
    } catch (error: unknown) {
      this.logger.error('Failed to create remix article', {
        articleId,
        dto,
        error,
        user,
      });

      throw error;
    }
  }

  @Get(':articleId/versions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getVersions(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    return await this.articlesService.getArticleVersions(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );
  }

  @Post(':articleId/versions/:promptId/restore')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async restoreVersion(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @Param('promptId') promptId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const data: ArticleDocument =
      await this.articlesService.restoreArticleVersion(
        articleId,
        promptId,
        publicMetadata.user,
        publicMetadata.organization,
        publicMetadata.brand,
      );

    return serializeSingle(request, this.serializer, data);
  }

  @Post(':articleId/prompts')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Media prompt generation (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.ARTICLE_PROMPT_GENERATION,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generatePrompt(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const prompt = await this.articlesService.generatePromptFromArticle(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    return { prompt };
  }

  @Post(':articleId/images')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateImageFromArticle(
    @Param('articleId') articleId: string,
    @Body() body: { model?: string; width?: number; height?: number },
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Get the article
    const article = await this.articlesService.findOne({
      _id: articleId,
      $or: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
      isDeleted: false,
    });

    if (!article) {
      return returnNotFound(this.constructorName, articleId);
    }

    // Get brand for default model
    const brand = article.brand
      ? await this.brandsService.findOne({
          _id: article.brand,
          isDeleted: false,
          organization: publicMetadata.organization,
        })
      : null;

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );
    const model = resolveGenerationDefaultModel<string>({
      brandDefault: brand?.defaultImageModel,
      explicit: body.model,
      organizationDefault: organizationSettings?.defaultImageModel,
      systemDefault: await this.routerService.getDefaultModel(
        ModelCategory.IMAGE,
      ),
    });

    // Return prompt and configuration for frontend to use
    return {
      config: {
        height: body.height || 1024,
        model,
        width: body.width || 1024,
      },
      prompt: article.generationPrompt || article.summary,
    };
  }

  @Post(':articleId/videos')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateVideoFromArticle(
    @Param('articleId') articleId: string,
    @Body() body: { model?: string; duration?: number },
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Get the article
    const article = await this.articlesService.findOne({
      _id: articleId,
      $or: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
      isDeleted: false,
    });

    if (!article) {
      return returnNotFound(this.constructorName, articleId);
    }

    // Get brand for default model
    const brand = article.brand
      ? await this.brandsService.findOne({
          _id: article.brand,
          isDeleted: false,
          organization: publicMetadata.organization,
        })
      : null;

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );
    const model = resolveGenerationDefaultModel<string>({
      brandDefault: brand?.defaultVideoModel,
      explicit: body.model,
      organizationDefault: organizationSettings?.defaultVideoModel,
      systemDefault: await this.routerService.getDefaultModel(
        ModelCategory.VIDEO,
      ),
    });

    // Return prompt and configuration for frontend to use
    return {
      config: {
        duration: body.duration || 8,
        model,
      },
      prompt: article.generationPrompt || article.summary,
    };
  }
}
