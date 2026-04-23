import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { GenerateTrendIdeasDto } from '@api/collections/trends/dto/trend-ideas.dto';
import { SaveTrendPreferencesDto } from '@api/collections/trends/dto/trend-preferences.dto';
import type {
  TrendTimelineEntry,
  TrendTurnoverResponse,
} from '@api/collections/trends/interfaces/trend-turnover.interface';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import {
  GetTrendingHashtagsDto,
  GetTrendingSoundsDto,
  GetViralVideosDto,
} from '@api/services/integrations/apify/dto/apify-trend.dto';
import type { User } from '@clerk/backend';
import { ActivitySource, Timeframe } from '@genfeedai/enums';
import { TrendSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('trends')
@UseInterceptors(CreditsInterceptor)
export class TrendsController {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly trendsService: TrendsService,
    private readonly trendPreferencesService: TrendPreferencesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  private toSafeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrends(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('refresh') refresh?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;

    // Check if user wants to force refresh
    if (refresh === 'true') {
      await this.trendsService.refreshTrends(organizationId, brandId);
    }

    // Get trends with access control
    const result = await this.trendsService.getTrendsWithAccessControl(
      organizationId,
      brandId,
      platform,
    );

    return serializeCollection(req, TrendSerializer, { docs: result.trends });
  }

  @Get('discovery')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrendsDiscovery(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('refresh') refresh?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;

    if (refresh === 'true') {
      await this.trendsService.refreshTrends(organizationId, brandId);
    }

    const result = await this.trendsService.getTrendsDiscovery(
      organizationId,
      brandId,
      platform,
    );

    return {
      summary: {
        connectedPlatforms: result.connectedPlatforms,
        lockedPlatforms: result.lockedPlatforms,
        totalTrends: result.trends.length,
      },
      trends: result.trends,
    };
  }

  @Get('content')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrendContent(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('limit') limitParam?: string,
    @Query('refresh') refresh?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;
    const parsedLimit = Number.parseInt(limitParam ?? '30', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 30
      : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await this.trendsService.getTrendContent(
      organizationId,
      brandId,
      {
        limit,
        platform,
        refresh: refresh === 'true',
      },
    );

    return {
      items: result.items,
      summary: {
        connectedPlatforms: result.connectedPlatforms,
        latestTrendAt: result.latestTrendAt,
        lockedPlatforms: result.lockedPlatforms,
        totalItems: result.items.length,
        totalTrends: result.totalTrends ?? result.items.length,
      },
    };
  }

  @Get('references')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getReferenceCorpus(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('trendId') trendId?: string,
    @Query('authorHandle') authorHandle?: string,
    @Query('limit') limitParam?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;
    const parsedLimit = Number.parseInt(limitParam ?? '30', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 30
      : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await this.trendsService.getReferenceCorpus(
      organizationId,
      brandId,
      {
        authorHandle,
        limit,
        platform,
        trendId,
      },
    );

    return {
      items: result.items,
      summary: {
        totalReferences: result.totalReferences,
      },
    };
  }

  @Get('references/accounts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTopReferenceAccounts(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('limit') limitParam?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;
    const parsedLimit = Number.parseInt(limitParam ?? '20', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await this.trendsService.getTopReferenceAccounts(
      organizationId,
      brandId,
      {
        limit,
        platform,
      },
    );

    return {
      accounts: result.accounts,
      summary: {
        totalAccounts: result.totalAccounts,
      },
    };
  }

  @Get('ideas')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Trend content ideas generation (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrendIdeas(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query() query: GenerateTrendIdeasDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;
    await this.assertOrganizationCreditsAvailable(
      organizationId,
      await this.getDefaultTextMinimumCredits(),
    );

    // Get trends
    const trends = await this.trendsService.getTrends(
      organizationId,
      brandId,
      query.platform,
      { allowFetchIfMissing: false },
    );

    // Generate ideas
    let billedCredits = 0;
    const ideasMap = await this.trendsService.generateContentIdeas(
      trends,
      query.limit || 10,
      (amount) => {
        billedCredits += amount;
      },
    );
    this.finalizeDeferredCredits(req, billedCredits);

    // Format response
    const result = Array.from(ideasMap.entries()).map(([platform, ideas]) => {
      const platformTrends = trends.filter((t) => t.platform === platform);
      const avgVirality =
        platformTrends.length > 0
          ? Math.round(
              platformTrends.reduce((sum, t) => sum + t.viralityScore, 0) /
                platformTrends.length,
            )
          : 0;

      return {
        avgViralityScore: avgVirality,
        ideas,
        platform,
        trends: platformTrends.slice(0, 5).map((t) => ({
          growthRate: t.growthRate,
          mentions: t.mentions,
          topic: t.topic,
          viralityScore: t.viralityScore,
        })),
      };
    });

    return {
      ideas: result,
      success: true,
      totalIdeas: result.reduce(
        (sum: number, r) => sum + (r.ideas.length || 0),
        0,
      ),
    };
  }

  private async assertOrganizationCreditsAvailable(
    organizationId: string | undefined,
    requiredCredits: number,
  ): Promise<void> {
    if (!organizationId || requiredCredits <= 0) {
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

  private async getDefaultTextMinimumCredits(): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      return 0;
    }

    if (model.pricingType === 'per-token') {
      return getMinimumTextCredits(model);
    }

    return model.cost || 0;
  }

  private finalizeDeferredCredits(request: Request, amount: number): void {
    const reqWithCredits = request as Request & {
      creditsConfig?: {
        amount?: number;
        deferred?: boolean;
        maxOverdraftCredits?: number;
      };
    };

    if (!reqWithCredits.creditsConfig?.deferred) {
      return;
    }

    reqWithCredits.creditsConfig = {
      ...reqWithCredits.creditsConfig,
      amount,
      deferred: false,
      maxOverdraftCredits: TrendsController.TEXT_MAX_OVERDRAFT_CREDITS,
    };
  }

  @Post('refresh')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async refreshTrends(@CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;

    const refreshedTrends = await this.trendsService.refreshTrends(
      organizationId,
      brandId,
    );

    return {
      count: refreshedTrends.length,
      message: 'Trends refreshed successfully',
      success: true,
    };
  }

  @Get('preferences')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getPreferences(@CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const brandId = publicMetadata?.brand;

    if (!organizationId) {
      return { preferences: null };
    }

    const preferences = await this.trendPreferencesService.getPreferences(
      organizationId,
      brandId,
    );

    return {
      preferences: preferences
        ? {
            categories: preferences.categories || [],
            hashtags: preferences.hashtags || [],
            keywords: preferences.keywords || [],
            platforms: preferences.platforms || [],
          }
        : null,
    };
  }

  @Post('preferences')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async savePreferences(
    @CurrentUser() user: User,
    @Body() dto: SaveTrendPreferencesDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;

    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    const preferences = await this.trendPreferencesService.savePreferences(
      organizationId,
      {
        brandId: dto.brandId || publicMetadata?.brand,
        categories: dto.categories,
        hashtags: dto.hashtags,
        keywords: dto.keywords,
        platforms: dto.platforms,
      },
    );

    return {
      message: 'Trend preferences saved successfully',
      preferences: {
        categories: preferences.categories || [],
        hashtags: preferences.hashtags || [],
        keywords: preferences.keywords || [],
        platforms: preferences.platforms || [],
      },
      success: true,
    };
  }

  @Get('analyze')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async analyzeTrends(
    @CurrentUser() _user: User,
    @Query('topic') topic: string,
    @Query('platform') platform: string,
    @Query('daysBack') daysBack?: string,
  ) {
    if (!topic || !platform) {
      return {
        message: 'Topic and platform are required',
        success: false,
      };
    }

    const analysis = await this.trendsService.analyzeTrendPatterns(
      topic,
      platform,
      daysBack ? parseInt(daysBack, 10) : 7,
    );

    return {
      analysis,
      success: true,
    };
  }

  // ==================== Viral Videos ====================

  @Get('videos')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
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
                  (sum, v) => sum + this.toSafeNumber(v.viralScore),
                  0,
                ) / videos.length,
              )
            : 0,
        platforms: [...new Set(videos.map((v) => v.platform))],
        totalVideos: videos.length,
      },
      videos,
    };
  }

  @Get('leaderboard')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
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

  // ==================== Trending Hashtags ====================

  @Get('hashtags')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
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
                  (sum, h) => sum + this.toSafeNumber(h.viralityScore),
                  0,
                ) / hashtags.length,
              )
            : 0,
        platforms: [...new Set(hashtags.map((h) => h.platform))],
        totalHashtags: hashtags.length,
      },
    };
  }

  // ==================== Trending Sounds ====================

  @Get('sounds')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
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
                  (sum, s) => sum + this.toSafeNumber(s.viralityScore),
                  0,
                ) / sounds.length,
              )
            : 0,
        totalSounds: sounds.length,
        totalUsage: sounds.reduce(
          (sum, s) => sum + this.toSafeNumber(s.usageCount),
          0,
        ),
      },
    };
  }

  // ==================== Trend Turnover Analytics ====================

  @Get('turnover')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTurnoverStats(
    @Query('days') daysParam?: string,
  ): Promise<TrendTurnoverResponse> {
    const parsed = parseInt(daysParam ?? '30', 10);
    const days = ([7, 30, 90].includes(parsed) ? parsed : 30) as 7 | 30 | 90;

    const [byPlatform, timeline] = await Promise.all([
      this.trendsService.getTurnoverStats(days),
      this.trendsService.getTrendTimeline(days),
    ]);

    const totalAppeared = byPlatform.reduce((s, p) => s + p.appeared, 0);
    const totalDied = byPlatform.reduce((s, p) => s + p.died, 0);
    const totalAlive = byPlatform.reduce((s, p) => s + p.alive, 0);
    const avgLifespanDays =
      byPlatform.length > 0
        ? Math.round(
            (byPlatform.reduce((s, p) => s + p.avgLifespanDays, 0) /
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
  async getTurnoverTimeline(
    @Query('days') daysParam?: string,
  ): Promise<TrendTimelineEntry[]> {
    const parsed = parseInt(daysParam ?? '30', 10);
    const days = ([7, 30, 90].includes(parsed) ? parsed : 30) as 7 | 30 | 90;
    return this.trendsService.getTrendTimeline(days);
  }

  @Get(':id/sources')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrendSources(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limitParam?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;
    const parsedLimit = Number.parseInt(limitParam ?? '5', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 5
      : Math.min(Math.max(parsedLimit, 1), 10);

    const items = await this.trendsService.getTrendSourceItems(
      id,
      organizationId,
      limit,
    );

    return { items };
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrendById(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata?.organization;

    // Get the trend
    const trend = await this.trendsService.getTrendById(id, organizationId);

    if (!trend) {
      throw new NotFoundException('Trend not found');
    }

    // Get related trends (same topic, different platforms)
    const relatedTrends = await this.trendsService.getRelatedTrends(
      trend.topic,
      trend.platform,
      organizationId,
      10,
    );

    // Get trend analysis for historical data
    const analysis = await this.trendsService.analyzeTrendPatterns(
      trend.topic,
      trend.platform,
      14, // 14 days of history
    );

    return {
      analysis,
      relatedTrends: serializeCollection(req, TrendSerializer, {
        docs: relatedTrends,
      }),
      trend: serializeSingle(req, TrendSerializer, trend),
    };
  }
}
