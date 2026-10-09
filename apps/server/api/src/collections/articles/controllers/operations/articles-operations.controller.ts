import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
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
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { resolveGenerationBrandIdForCaller } from '@api/collections/api-keys/utils/resolve-generation-brand-for-caller.util';
import {
  ArticleGenerationType,
  GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { ReviewArticleDto } from '@api/collections/articles/dto/review-article.dto';
import { ArticleGenerationCreditsService } from '@api/collections/articles/services/article-generation-credits.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
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
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { ActivityRef } from '@api/services/activity-recording/activity-recording.types';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ModelCategory,
} from '@genfeedai/contracts';
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
@OrganizationModule('playground')
export class ArticlesOperationsController {
  private static readonly ARTICLE_TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly activityRecorder: ActivityRecorderService,
    private readonly apiKeysService: ApiKeysService,
    private readonly articleGenerationCreditsService: ArticleGenerationCreditsService,
    private readonly articlesService: ArticlesService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    private readonly modelsService: ModelsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post('generations')
  @UseGuards(CreditsGuard)
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
    const brandId = await this.resolveBrandId(dto, user);
    const generationType = dto.type || ArticleGenerationType.STANDARD;
    const isXArticle = generationType === ArticleGenerationType.X_ARTICLE;

    // Check if article generation is enabled for this organization
    const orgSettings =
      await this.organizationSettingsService.ensureForOrganization(
        user.organizationId,
      );

    if (!orgSettings.isGenerateArticlesEnabled) {
      throw new ForbiddenException(
        'Article generation is not enabled for this organization',
      );
    }

    await this.assertGenerationModelOverrideSupported(dto.model);

    const byok = await this.articleGenerationCreditsService.admitGeneration(
      request,
      user.organizationId,
      dto,
    );

    // Create activity for article generation start
    const activity = await this.activityRecorder.record({
      brandId,
      key: ActivityKey.ARTICLE_PROCESSING,
      organizationId: user.organizationId,
      source: ActivitySource.ARTICLE_GENERATION,
      userId: user.userId ?? user.id,
      value: JSON.stringify({
        count: dto.count || 1,
        prompt: dto.prompt?.substring(0, 100),
        type: generationType,
      }),
    });

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
      const { articles, billedCredits } =
        await this.articlesService.generateArticles(
          dto,
          user.userId ?? user.id,
          user.organizationId,
          brandId,
          byok,
        );

      this.settleDeferredCredits(request, billedCredits);

      // Create activities for each generated article
      for (const [index, article] of articles.entries()) {
        const completion = {
          brandId,
          entityId: article.id,
          entityModel: ActivityEntityModel.ARTICLE,
          key: ActivityKey.ARTICLE_GENERATED,
          organizationId: user.organizationId,
          source: ActivitySource.ARTICLE_GENERATION,
          userId: user.userId ?? user.id,
          value: article.id.toString(),
          isRead: false,
        };
        if (index === 0) {
          await this.activityRecorder.update(activity, completion);
        } else {
          await this.activityRecorder.record(completion);
        }

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
      await this.recordGenerationFailure(activity, error, isXArticle, user.id);

      throw error;
    }
  }

  @Post(':articleId/reviews')
  @UseGuards(CreditsGuard)
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
    const byok = await this.articleGenerationCreditsService.admitReview(
      request,
      user.organizationId,
    );

    const { billedCredits, review } = await this.articlesService.reviewArticle(
      articleId,
      user.userId ?? user.id,
      user.organizationId,
      dto.focus,
      byok,
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
    activity: ActivityRef,
    error: unknown,
    isXArticle: boolean,
    userId: string,
  ): Promise<void> {
    const errorMessage =
      (error as Error)?.message || 'Article generation failed';

    const activityId = activity.id;
    await this.activityRecorder.update(activity, {
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

  /**
   * Generation always has an explicit brand (#5219), resolved through the
   * single API-key/MCP/session resolver (#5292) — no more "any brand in this
   * org" fallback for an API-key caller:
   *   1. The request's own brandId.
   *   2. For an API-key caller, the key's validated `defaultBrandId`; for
   *      every other (app) caller, `user.brandId` — the member's
   *      `currentBrandId` invariant, re-validated here since it can be
   *      briefly stale (e.g. right after a brand delete).
   *   3. The acting member's own `currentBrandId` in this org — for an
   *      API-key call, the KEY OWNER's member row.
   */
  private resolveBrandId(
    dto: GenerateArticlesDto,
    user: User,
  ): Promise<string> {
    return resolveGenerationBrandIdForCaller({
      explicitBrandId: dto.brandId,
      noApiKeyDefaultBrandMessage:
        'brandId is required to generate articles. Configure a default brand for this API key, or pass brandId explicitly.',
      noBrandMessage: 'brandId is required to generate articles.',
      services: {
        apiKeysService: this.apiKeysService,
        brandsService: this.brandsService,
        membersService: this.membersService,
      },
      user,
    });
  }

  /**
   * Gates the per-request generation model (`GenerateArticlesDto.model`) before
   * anything is generated.
   *
   * The text pricing lookup in `ArticleTextGenerationService` resolves the key
   * against the models catalogue *after* the provider call, so an unknown or
   * non-text key would only surface once the tokens were already spent —
   * failing the request with nothing to bill and nothing to show. Reject it up
   * front instead. No override means the org/system default applies and there
   * is nothing to check.
   *
   * Retired (`isLegacy`) and disabled (`isActive: false`) registry keys are
   * rejected the same way — the Phase C registry policy (#2479) routes only
   * active, non-legacy keys.
   */
  private async assertGenerationModelOverrideSupported(
    modelKey?: string,
  ): Promise<void> {
    if (!modelKey) {
      return;
    }

    const model = await this.modelsService.findOne({
      isActive: true,
      isDeleted: false,
      isLegacy: false,
      key: baseModelKey(modelKey),
    });

    if (model?.category === ModelCategory.TEXT) {
      return;
    }

    throw new HttpException(
      {
        detail: `Unknown text model for article generation: ${modelKey}`,
        title: 'Validation failed',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
