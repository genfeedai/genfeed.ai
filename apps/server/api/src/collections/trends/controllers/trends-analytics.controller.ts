import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import {
  GetTrendingHashtagsDto,
  GetTrendingSoundsDto,
  GetViralVideosDto,
} from '@api/services/integrations/apify/dto/apify-trend.dto';
import { Timeframe } from '@genfeedai/contracts';
import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@AutoSwagger()
@OrganizationModule('discovery')
@Controller('trends')
@UseInterceptors(CreditsInterceptor)
export class TrendsAnalyticsController {
  constructor(private readonly trendsService: TrendsService) {}

  @TenantReadPolicy('selected')
  @Get('videos')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getViralVideos',
    summary: 'getViralVideos',
  })
  async getViralVideos(
    @Query() query: GetViralVideosDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { organizationId, brandId } = this.resolveBrandScope(query, user);
    const videos =
      query.relevance === 'market'
        ? await this.trendsService.getViralVideos({
            limit: query.limit,
            platform: query.platform,
            timeframe: query.timeframe,
          })
        : await this.trendsService.getBrandViralVideos(
            organizationId,
            brandId ?? '',
            {
              limit: query.limit,
              platform: query.platform,
              timeframe: query.timeframe,
            },
          );

    return {
      summary: {
        avgViralScore:
          videos.length > 0
            ? Math.round(
                videos.reduce(
                  (sum, video) => sum + this.toSafeNumber(video.viralScore),
                  0,
                ) / videos.length,
              )
            : 0,
        platforms: [...new Set(videos.map((video) => video.platform))],
        totalVideos: videos.length,
      },
      videos,
    };
  }

  @Get('leaderboard')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getViralLeaderboard',
    summary: 'getViralLeaderboard',
  })
  async getViralLeaderboard(
    @Query('timeframe') timeframe?:
      | Timeframe.H24
      | Timeframe.H72
      | Timeframe.D7,
    @Query('limit') limit?: number,
  ) {
    const videos = await this.trendsService.getViralLeaderboard({
      limit: limit || 20,
      timeframe: timeframe || Timeframe.H24,
    });

    return {
      leaderboard: videos,
      timeframe: timeframe || Timeframe.H24,
      totalVideos: videos.length,
    };
  }

  @TenantReadPolicy('selected')
  @Get('hashtags')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTrendingHashtags',
    summary: 'getTrendingHashtags',
  })
  async getTrendingHashtags(
    @Query() query: GetTrendingHashtagsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { organizationId, brandId } = this.resolveBrandScope(query, user);
    const options = {
      limit: query.limit,
      platform: query.platform,
      timeframe: query.timeframe,
    };
    const hashtags =
      query.relevance === 'market'
        ? await this.trendsService.getTrendingHashtags(options)
        : await this.trendsService.getBrandTrendingHashtags(
            organizationId,
            brandId ?? '',
            options,
          );

    return {
      hashtags,
      summary: {
        avgViralityScore:
          hashtags.length > 0
            ? Math.round(
                hashtags.reduce(
                  (sum, hashtag) =>
                    sum + this.toSafeNumber(hashtag.viralityScore),
                  0,
                ) / hashtags.length,
              )
            : 0,
        platforms: [...new Set(hashtags.map((hashtag) => hashtag.platform))],
        totalHashtags: hashtags.length,
      },
    };
  }

  @TenantReadPolicy('selected')
  @Get('sounds')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTrendingSounds',
    summary: 'getTrendingSounds',
  })
  async getTrendingSounds(
    @Query() query: GetTrendingSoundsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { organizationId, brandId } = this.resolveBrandScope(query, user);
    const options = {
      limit: query.limit,
      platform: query.platform,
      timeframe: query.timeframe,
    };
    const sounds =
      query.relevance === 'market'
        ? await this.trendsService.getTrendingSounds(options)
        : await this.trendsService.getBrandTrendingSounds(
            organizationId,
            brandId ?? '',
            options,
          );

    return {
      sounds,
      summary: {
        avgViralityScore:
          sounds.length > 0
            ? Math.round(
                sounds.reduce(
                  (sum, sound) => sum + this.toSafeNumber(sound.viralityScore),
                  0,
                ) / sounds.length,
              )
            : 0,
        totalSounds: sounds.length,
        totalUsage: sounds.reduce(
          (sum, sound) => sum + this.toSafeNumber(sound.usageCount),
          0,
        ),
      },
    };
  }

  private resolveBrandScope(query: GetViralVideosDto, user: AuthenticatedUser) {
    const readScope = resolveTenantReadScope(user);
    const brandId = query.brandId || readScope.brandId;
    if (
      query.relevance !== 'market' &&
      !getIsSuperAdmin(user) &&
      (!user.brandId || brandId !== user.brandId)
    ) {
      throw new ForbiddenException(
        'Select an authorized brand before reading its trends.',
      );
    }
    return { organizationId: readScope.organizationId, brandId };
  }

  private toSafeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}
