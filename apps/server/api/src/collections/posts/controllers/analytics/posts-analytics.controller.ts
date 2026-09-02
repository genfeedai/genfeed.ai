import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { CredentialPlatform, MemberRole } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
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
  SetMetadata,
  UseGuards,
} from '@nestjs/common';

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

  @Get(':postId/analytics')
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
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<JsonApiSingleResponse<PostAnalyticsWithRangeAttributes>> {
    // Verify publication ownership
    const post = await this.postsService.findOne({
      id: postId,
      OR: [
        { userId: user.userId ?? user.id },
        { organizationId: user.organizationId },
      ],
    });

    if (!post) {
      return returnNotFound(this.constructorName, postId);
    }

    // Get analytics summary
    const summary =
      await this.postAnalyticsService.getPostAnalyticsSummary(postId);

    // Get analytics by date range if provided
    let dateRangeAnalytics = null;
    if (startDate && endDate) {
      dateRangeAnalytics =
        await this.postAnalyticsService.getAnalyticsByDateRange(
          postId,
          new Date(startDate),
          new Date(endDate),
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
  ): Promise<JsonApiSingleResponse<PostAnalyticsRefreshAttributes>> {
    // Verify publication ownership
    const post = await this.postsService.findOne({
      id: postId,
      OR: [
        { userId: user.userId ?? user.id },
        { organizationId: user.organizationId },
      ],
    });

    if (!post) {
      return returnNotFound(this.constructorName, postId);
    }

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

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      brandId,
      organizationId,
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
      userId: user.userId ?? user.id,
    });

    // Set rate limit cache
    await this.postsService.setCachedData(
      lastRefreshKey,
      Date.now().toString(),
      3600, // 1 hour TTL
    );

    // Get updated analytics
    const summary =
      await this.postAnalyticsService.getPostAnalyticsSummary(postId);

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
          userId: user.userId ?? user.id,
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
