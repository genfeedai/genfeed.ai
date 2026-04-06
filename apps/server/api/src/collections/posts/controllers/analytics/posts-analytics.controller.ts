import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { MemberRole, PostStatus, PublishStatus } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
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
import { Types } from 'mongoose';

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
}

interface OrganizationAnalyticsRefreshAttributes {
  totalPosts: number;
  successCount: number;
  errorCount: number;
  lastRefreshed: Date;
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
    const publicMetadata = getPublicMetadata(user);

    // Verify publication ownership
    const post = await this.postsService.findOne({
      _id: new Types.ObjectId(postId),
      $or: [
        { user: new Types.ObjectId(publicMetadata.user) },
        { organization: new Types.ObjectId(publicMetadata.organization) },
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
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    // Verify publication ownership
    const post = await this.postsService.findOne({
      _id: new Types.ObjectId(postId),
      $or: [
        { user: new Types.ObjectId(publicMetadata.user) },
        { organization: new Types.ObjectId(publicMetadata.organization) },
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

    // Get credential for the post
    const credential = await this.credentialsService.findOne({
      _id: post.credential,
      brand: new Types.ObjectId(post.brand),
      organization: new Types.ObjectId(post.organization),
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

    // Track analytics for this specific publication
    const trackUrl = `${url} trackPostAnalytics`;
    await this.postAnalyticsService.trackPostAnalytics(
      post,
      credential as unknown,
      trackUrl,
    );

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
      const publicMetadata = getPublicMetadata(user);

      // Check organization-wide rate limiting - one refresh per hour
      const lastRefreshKey = `analytics_refresh_all:${publicMetadata.organization}`;
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

      // Find all published posts for the organization
      const posts = await this.postsService.findAll(
        [
          {
            $match: {
              externalId: { $exists: true, $ne: null },
              isDeleted: false,
              organization: new Types.ObjectId(publicMetadata.organization),
              status: {
                $in: [
                  PublishStatus.PUBLISHED,
                  PostStatus.PUBLIC,
                  PostStatus.UNLISTED,
                  PostStatus.PRIVATE,
                ],
              },
            },
          },
          {
            $lookup: {
              as: 'credential',
              foreignField: '_id',
              from: 'credentials',
              localField: 'credential',
            },
          },
          {
            $unwind: '$credential',
          },
        ],
        { customLabels, pagination: false },
      );

      let successCount = 0;
      let errorCount = 0;

      for (const post of posts.docs || []) {
        try {
          const trackUrl = `${url} trackPostAnalytics:${post._id}`;
          await this.postAnalyticsService.trackPostAnalytics(
            post,
            post.credential as unknown as CredentialEntity,
            trackUrl,
          );
          successCount++;
        } catch (error: unknown) {
          errorCount++;
          this.loggerService.error(
            `Failed to refresh analytics for post ${post._id}`,
            error,
          );
        }
      }

      // Set rate limit cache
      await this.postsService.setCachedData(
        lastRefreshKey,
        Date.now().toString(),
        3600, // 1 hour TTL
      );

      return {
        data: {
          attributes: {
            errorCount,
            lastRefreshed: new Date(),
            successCount,
            totalPosts: posts.docs?.length || 0,
          },
          id: publicMetadata.organization,
          type: 'analytics-refresh',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
