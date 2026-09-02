import type {
  TrendTimelineEntry,
  TrendTurnoverResponse,
} from '@api/collections/trends/interfaces/trend-turnover.interface';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  GetTrendingHashtagsDto,
  GetTrendingSoundsDto,
  GetViralVideosDto,
} from '@api/services/integrations/apify/dto/apify-trend.dto';
import { Timeframe } from '@genfeedai/enums';
import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@AutoSwagger()
@Controller('trends')
@UseInterceptors(CreditsInterceptor)
export class TrendsAnalyticsController {
  constructor(private readonly trendsService: TrendsService) {}

  @Get('videos')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getViralVideos',
    summary: 'getViralVideos',
  })
  async getViralVideos(@Query() query: GetViralVideosDto) {
    const videos = await this.trendsService.getViralVideos({
      limit: query.limit,
      platform: query.platform,
      timeframe: query.timeframe,
    });

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

  @Get('hashtags')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTrendingHashtags',
    summary: 'getTrendingHashtags',
  })
  async getTrendingHashtags(@Query() query: GetTrendingHashtagsDto) {
    const hashtags = await this.trendsService.getTrendingHashtags({
      limit: query.limit,
      platform: query.platform,
    });

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

  @Get('sounds')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTrendingSounds',
    summary: 'getTrendingSounds',
  })
  async getTrendingSounds(@Query() query: GetTrendingSoundsDto) {
    const sounds = await this.trendsService.getTrendingSounds({
      limit: query.limit,
    });

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

  @Get('turnover')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTurnoverStats',
    summary: 'getTurnoverStats',
  })
  async getTurnoverStats(
    @Query('days') daysParam?: string,
  ): Promise<TrendTurnoverResponse> {
    const days = this.parseTurnoverDays(daysParam);
    const [byPlatform, timeline] = await Promise.all([
      this.trendsService.getTurnoverStats(days),
      this.trendsService.getTrendTimeline(days),
    ]);

    const totalAppeared = byPlatform.reduce(
      (sum, platform) => sum + platform.appeared,
      0,
    );
    const totalDied = byPlatform.reduce(
      (sum, platform) => sum + platform.died,
      0,
    );
    const totalAlive = byPlatform.reduce(
      (sum, platform) => sum + platform.alive,
      0,
    );
    const avgLifespanDays =
      byPlatform.length > 0
        ? Math.round(
            (byPlatform.reduce(
              (sum, platform) => sum + platform.avgLifespanDays,
              0,
            ) /
              byPlatform.length) *
              10,
          ) / 10
        : 0;

    return {
      byPlatform,
      days,
      timeline,
      totals: {
        alive: totalAlive,
        appeared: totalAppeared,
        avgLifespanDays,
        died: totalDied,
        turnoverRate:
          totalAppeared > 0 ? Math.round((totalDied / totalAppeared) * 100) : 0,
      },
    };
  }

  @Get('turnover/timeline')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTurnoverTimeline',
    summary: 'getTurnoverTimeline',
  })
  getTurnoverTimeline(
    @Query('days') daysParam?: string,
  ): Promise<TrendTimelineEntry[]> {
    return this.trendsService.getTrendTimeline(
      this.parseTurnoverDays(daysParam),
    );
  }

  private parseTurnoverDays(daysParam?: string): 7 | 30 | 90 {
    const parsed = Number.parseInt(daysParam ?? '30', 10);
    return ([7, 30, 90].includes(parsed) ? parsed : 30) as 7 | 30 | 90;
  }

  private toSafeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}
