/**
 * Articles Operations Controller
 * Handles the credit-billed article generation routes:
 * - Generate articles (deferred credit resolution)
 * - Review an article (deferred credit resolution)
 *
 * These routes share the credit pre-flight helpers, so they live together and
 * apart from the plain CRUD surface on `ArticlesController`.
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import {
  ArticleGenerationType,
  GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { ReviewArticleDto } from '@api/collections/articles/dto/review-article.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
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
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/enums';
import { ArticleSerializer } from '@genfeedai/serializers';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * `CreditsInterceptor` stashes the pending charge on the request when
 * `@DeferCreditsUntilModelResolution()` is set, so both routes below reopen it
 * once the real billed amount is known.
 */
type DeferredCreditsRequest = Request & {
  creditsConfig?: {
    amount?: number;
    deferred?: boolean;
    modelKey?: string;
    maxOverdraftCredits?: number;
  };
};

@AutoSwagger()
@Controller('articles')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class ArticlesOperationsController {
  private static readonly ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly articlesService: ArticlesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

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
      activityId: activity.id.toString(),
      label: isXArticle ? 'X Article Generation' : 'Article Generation',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: activity.id.toString(),
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

      this.settleDeferredCredits(request, billedCredits);

      // Create activities for each generated article
      for (const article of articles) {
        await this.activitiesService.create(
          new ActivityEntity({
            brand: publicMetadata.brand,
            entityId: article.id,
            entityModel: ActivityEntityModel.ARTICLE,
            key: ActivityKey.ARTICLE_GENERATED,
            organization: publicMetadata.organization,
            source: ActivitySource.ARTICLE_GENERATION,
            user: publicMetadata.user,
            value: article.id.toString(),
          }),
        );

        // Emit background-task-update WebSocket event for each article
        await this.websocketService.publishBackgroundTaskUpdate({
          activityId: activity.id.toString(),
          label: isXArticle ? 'X Article Generation' : 'Article Generation',
          progress: 100,
          resultId: article.id.toString(),
          room: getUserRoomName(user.id),
          status: 'completed',
          taskId: article.id.toString(),
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
      await this.recordGenerationFailure(
        activity.id.toString(),
        error,
        isXArticle,
        user.id,
      );

      throw error;
    }
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

    this.settleDeferredCredits(request, billedCredits);

    return review;
  }

  /**
   * Replaces the interceptor's deferred placeholder with the amount the text
   * models actually billed. A no-op when the charge was never deferred.
   */
  private settleDeferredCredits(request: Request, billedCredits: number): void {
    const reqWithCredits = request as DeferredCreditsRequest;

    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount: billedCredits,
      deferred: false,
      maxOverdraftCredits:
        ArticlesOperationsController.ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }

  private async recordGenerationFailure(
    activityId: string,
    error: unknown,
    isXArticle: boolean,
    userId: string,
  ): Promise<void> {
    const errorMessage =
      (error as Error)?.message || 'Article generation failed';

    await this.activitiesService.patch(activityId, {
      key: ActivityKey.ARTICLE_FAILED,
      value: JSON.stringify({
        error: errorMessage,
      }),
    });

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId,
      error: errorMessage,
      label: isXArticle ? 'X Article Generation' : 'Article Generation',
      room: getUserRoomName(userId),
      status: 'failed',
      taskId: activityId,
      userId,
    });
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
}
