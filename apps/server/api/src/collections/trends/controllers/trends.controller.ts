import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { GenerateTrendIdeasDto } from '@api/collections/trends/dto/trend-ideas.dto';
import { SaveTrendPreferencesDto } from '@api/collections/trends/dto/trend-preferences.dto';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { finalizeDeferredTextCredits } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import {
  assertOrganizationCreditsAvailable,
  getDefaultTextMinimumCredits,
} from '@api/helpers/utils/credits/organization-credits-gate.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ActivitySource } from '@genfeedai/contracts';
import { TrendSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
  constructor(
    private readonly trendsService: TrendsService,
    private readonly trendPreferencesService: TrendPreferencesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrends(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('refresh') refresh?: string,
  ) {
    const organizationId = user.organizationId;
    const brandId = user.brandId;

    if (refresh === 'true') {
      throw new BadRequestException(
        'Use POST /trends/refresh to start ingestion.',
      );
    }

    // Get trends with access control
    const result = await this.trendsService.getTrendsWithAccessControl(
      organizationId,
      brandId,
      platform,
    );

    return serializeCollection(req, TrendSerializer, { docs: result.trends });
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
    const organizationId = user.organizationId;
    const brandId = user.brandId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organizationId,
      await getDefaultTextMinimumCredits(this.modelsService),
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
    finalizeDeferredTextCredits(req, billedCredits);

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

  @Post('refresh')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async refreshTrends(@CurrentUser() user: User) {
    const organizationId = user.organizationId;
    const brandId = user.brandId;

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
    const organizationId = user.organizationId;
    const brandId = user.brandId;

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
            autoRequeueWinners: preferences.autoRequeueWinners ?? true,
            categories: preferences.categories || [],
            hashtags: preferences.hashtags || [],
            keywords: preferences.keywords || [],
            platforms: preferences.platforms || [],
          }
        : null,
    };
  }

  @Put('preferences')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async savePreferences(
    @CurrentUser() user: User,
    @Body() dto: SaveTrendPreferencesDto,
  ) {
    const organizationId = user.organizationId;

    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    const preferences = await this.trendPreferencesService.savePreferences(
      organizationId,
      {
        autoRequeueWinners: dto.autoRequeueWinners,
        brandId: dto.brandId || user.brandId,
        categories: dto.categories,
        hashtags: dto.hashtags,
        keywords: dto.keywords,
        platforms: dto.platforms,
      },
    );

    return {
      message: 'Trend preferences saved successfully',
      preferences: {
        autoRequeueWinners: preferences.autoRequeueWinners ?? true,
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

  @Get(':id/sources')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrendSources(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('limit') limitParam?: string,
  ) {
    const organizationId = user.organizationId;
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
    const organizationId = user.organizationId;

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
