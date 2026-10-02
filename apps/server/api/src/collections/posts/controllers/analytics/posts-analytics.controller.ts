import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AnalyticsPublicationScopeQueryDto } from '@api/collections/posts/dto/analytics-publication-scope-query.dto';
import {
  PublicationInsightScopeQueryDto,
  PublicationInsightsQueryDto,
} from '@api/collections/posts/dto/publication-insights-query.dto';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import {
  extensionPublicationCaptureAnalyticsAvailability,
  isExtensionPublicationCapture,
} from '@api/collections/posts/services/post-publication-capture.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  CredentialPlatform,
  MemberRole,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { PublicationInsightSerializer } from '@serializers/server/content/publication-insight.serializer';
import type { Request } from 'express';

type PostAnalyticsSummary = Awaited<
  ReturnType<PostAnalyticsService['getPostAnalyticsSummary']>
>;

type PostAnalyticsByDateRange = Awaited<
  ReturnType<PostAnalyticsService['getAnalyticsByDateRange']>
>;

interface PostAnalyticsWithRangeAttributes {
  summary: PostAnalyticsSummary;
  dateRangeAnalytics: PostAnalyticsByDateRange | null;
}

interface PostAnalyticsRefreshAttributes {
  summary: PostAnalyticsSummary;
  lastRefreshed: Date;
  workflowJobId: string;
  workflowId: string;
}

interface OrganizationAnalyticsRefreshAttributes {
  totalPosts: number;
  successCount: number;
  errorCount: number;
  lastRefreshed: Date;
  workflowJobId: string;
  workflowId: string;
}

@AutoSwagger()
@FeatureFlag('publishing')
@Controller('posts')
@UseGuards(RolesGuard)
export class PostsAnalyticsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly analyticsSyncWorkflowService: AnalyticsSyncWorkflowService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('publication-insights')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @UsePipes(ValidationPipe)
  async getPublicationInsights(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PublicationInsightsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const data = await this.postsService.getPublicationInsights(query, {
      organizationId: user.organizationId,
      userId: user.userId,
      brandId: query.brandId,
    });
    return serializeCollection(request, PublicationInsightSerializer, data);
  }

  @Get(':postId/publication-insights')
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @UsePipes(ValidationPipe)
  async getPublicationInsight(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Query() query: PublicationInsightScopeQueryDto,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.postsService.findPublicationInsightById(postId, {
      organizationId: user.organizationId,
      userId: user.userId,
      brandId: query.brandId,
    });
    if (!data) return returnNotFound(this.constructorName, postId);
    return serializeSingle(request, PublicationInsightSerializer, data);
  }

  @Get(':postId/analytics')
  @UsePipes(ValidationPipe)
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getAnalytics(
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Query() query: AnalyticsPublicationScopeQueryDto = {},
  ): Promise<JsonApiSingleResponse<PostAnalyticsWithRangeAttributes>> {
    const selectedBrandId = query.brandId ?? user.brandId;
    if (!selectedBrandId || !user.organizationId)
      throw new BadRequestException(
        'An authenticated organization and selected brand are required',
      );
    const post = await this.postsService.findOne({
      id: postId,
      organizationId: user.organizationId,
      brandId: selectedBrandId,
      isDeleted: false,
      brand: { organizationId: user.organizationId, isDeleted: false },
    });

    if (!post) {
      return returnNotFound(this.constructorName, postId);
    }

    // Get analytics summary
    const summary = await this.postAnalyticsService.getPostAnalyticsSummary(
      postId,
      user.organizationId,
    );

    // Get analytics by date range if provided
    let dateRangeAnalytics = null;
    if (query.startDate && query.endDate) {
      dateRangeAnalytics =
        await this.postAnalyticsService.getAnalyticsByDateRange(
          postId,
          new Date(query.startDate),
          new Date(query.endDate),
          user.organizationId,
        );
    }

    return {
      data: {
        attributes: {
          dateRangeAnalytics,
          summary,
        },
        id: postId,
        type: 'post-analytics',
      },
    };
  }

  @Post(':postId/refresh-analytics')
  @UsePipes(ValidationPipe)
  @SetMetadata('roles', [
    'superadmin',
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
  ])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async refreshAnalytics(
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Query() query: AnalyticsPublicationScopeQueryDto = {},
  ): Promise<JsonApiSingleResponse<PostAnalyticsRefreshAttributes>> {
    const selectedBrandId = query.brandId ?? user.brandId;
    if (!selectedBrandId || !user.organizationId)
      throw new BadRequestException(
        'An authenticated organization and selected brand are required',
      );
    const post = await this.postsService.findOne({
      id: postId,
      organizationId: user.organizationId,
      brandId: selectedBrandId,
      isDeleted: false,
      brand: { organizationId: user.organizationId, isDeleted: false },
    });

    if (!post) {
      return returnNotFound(this.constructorName, postId);
    }

    if (
      isExtensionPublicationCapture(post) &&
      extensionPublicationCaptureAnalyticsAvailability(post) !== 'eligible'
    )
      throw new BadRequestException(
        'This captured publication is not eligible for analytics collection',
      );

    // Check rate limiting - one refresh per hour per post
    const lastRefreshKey = `analytics_refresh:${postId}`;
    const lastRefresh = await this.postsService.getCachedData(lastRefreshKey);

    if (lastRefresh) {
      const timeSinceRefresh = Date.now() - parseInt(lastRefresh, 10);
      const oneHourInMs = 60 * 60 * 1000;

      if (timeSinceRefresh < oneHourInMs) {
        const remainingMinutes = Math.ceil(
          (oneHourInMs - timeSinceRefresh) / 60000,
        );
        throw new HttpException(
          {
            detail: `Analytics can only be refreshed once per hour. Please try again in ${remainingMinutes} minutes.`,
            title: 'Rate limit exceeded',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Get credential for the post.
    const credentialId = post.credentialId;
    const brandId = post.brandId;
    const organizationId = post.organizationId;

    if (!organizationId) {
      throw new BadRequestException(
        'organizationId is required to refresh analytics',
      );
    }

    if (!credentialId) {
      throw new BadRequestException(
        'credentialId is required to refresh analytics',
      );
    }

    const platform = toPrismaCredentialPlatform(post.platform);
    if (!platform)
      throw new BadRequestException('Unsupported publication platform');
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      brandId,
      organizationId,
      isDeleted: false,
      isConnected: true,
      platform,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'The credential for this post is not available',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const refresh = await this.analyticsSyncWorkflowService.queuePostRefresh({
      organizationId,
      platform: credential.platform as CredentialPlatform,
      postId,
      userId: user.userId,
    });

    // Set rate limit cache
    await this.postsService.setCachedData(
      lastRefreshKey,
      Date.now().toString(),
      3600, // 1 hour TTL
    );

    // Get updated analytics
    const summary = await this.postAnalyticsService.getPostAnalyticsSummary(
      postId,
      user.organizationId,
    );

    return {
      data: {
        attributes: {
          lastRefreshed: new Date(),
          summary,
          workflowJobId: refresh.jobId,
          workflowId: refresh.workflowId,
        },
        id: postId,
        type: 'post-analytics',
      },
    };
  }

  @Post('analytics')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async refreshAllAnalytics(
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<OrganizationAnalyticsRefreshAttributes>> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      // Check organization-wide rate limiting - one refresh per hour
      const lastRefreshKey = `analytics_refresh_all:${user.organizationId}`;
      const lastRefresh = await this.postsService.getCachedData(lastRefreshKey);

      if (lastRefresh) {
        const timeSinceRefresh = Date.now() - parseInt(lastRefresh, 10);
        const oneHourInMs = 60 * 60 * 1000;

        if (timeSinceRefresh < oneHourInMs) {
          const remainingMinutes = Math.ceil(
            (oneHourInMs - timeSinceRefresh) / 60000,
          );
          throw new HttpException(
            {
              detail: `Organization analytics can only be refreshed once per hour. Please try again in ${remainingMinutes} minutes.`,
              title: 'Rate limit exceeded',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      const refresh =
        await this.analyticsSyncWorkflowService.queueOrganizationRefresh({
          organizationId: user.organizationId,
          userId: user.userId,
        });

      // Set rate limit cache
      await this.postsService.setCachedData(
        lastRefreshKey,
        Date.now().toString(),
        3600, // 1 hour TTL
      );

      return {
        data: {
          attributes: {
            errorCount: 0,
            lastRefreshed: new Date(),
            successCount: 0,
            totalPosts: 0,
            workflowJobId: refresh.jobId,
            workflowId: refresh.workflowId,
          },
          id: user.organizationId,
          type: 'analytics-refresh',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
