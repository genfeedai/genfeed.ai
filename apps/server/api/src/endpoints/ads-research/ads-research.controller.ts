import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type {
  AdsChannel,
  AdsResearchMetric,
  AdsResearchPlatform,
  AdsResearchSource,
  AdsResearchTimeframe,
} from '@genfeedai/interfaces/integrations/ads-research.interface';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('ads/research')
export class AdsResearchController {
  constructor(private readonly adsResearchService: AdsResearchService) {}

  @Get()
  async listAds(
    @CurrentUser() user: User,
    @Query('brandId') brandId?: string,
    @Query('brandName') brandName?: string,
    @Query('industry') industry?: string,
    @Query('source') source?: AdsResearchSource,
    @Query('platform') platform?: AdsResearchPlatform,
    @Query('channel') channel?: AdsChannel,
    @Query('metric') metric?: AdsResearchMetric,
    @Query('timeframe') timeframe?: AdsResearchTimeframe,
    @Query('limit') limit?: string,
    @Query('credentialId') credentialId?: string,
    @Query('adAccountId') adAccountId?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    return this.adsResearchService.listAds(user.organizationId, {
      adAccountId,
      brandId,
      brandName,
      channel,
      credentialId,
      industry,
      limit: limit ? Number(limit) : undefined,
      loginCustomerId,
      metric,
      platform,
      source,
      timeframe,
    });
  }

  @Get(':source/:id')
  async getAdDetail(
    @CurrentUser() user: User,
    @Param('source') source: Exclude<AdsResearchSource, 'all'>,
    @Param('id') id: string,
    @Query('platform') platform?: AdsResearchPlatform,
    @Query('channel') channel?: AdsChannel,
    @Query('credentialId') credentialId?: string,
    @Query('adAccountId') adAccountId?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    return this.adsResearchService.getAdDetail(user.organizationId, {
      adAccountId,
      channel,
      credentialId,
      id,
      loginCustomerId,
      platform,
      source,
    });
  }

  @Post('ad-pack')
  async generateAdPack(
    @CurrentUser() user: User,
    @Body()
    body: {
      adId: string;
      source: Exclude<AdsResearchSource, 'all'>;
      brandId?: string;
      brandName?: string;
      industry?: string;
      objective?: string;
      platform?: AdsResearchPlatform;
      channel?: AdsChannel;
      credentialId?: string;
      adAccountId?: string;
      loginCustomerId?: string;
    },
  ) {
    return this.adsResearchService.generateAdPack(user.organizationId, {
      ...body,
    });
  }

  @Post('remix-workflow')
  async createRemixWorkflow(
    @CurrentUser() user: User,
    @Body()
    body: {
      adId: string;
      source: Exclude<AdsResearchSource, 'all'>;
      brandId?: string;
      brandName?: string;
      industry?: string;
      objective?: string;
      platform?: AdsResearchPlatform;
      channel?: AdsChannel;
      credentialId?: string;
      adAccountId?: string;
      loginCustomerId?: string;
    },
  ) {
    return this.adsResearchService.createRemixWorkflow({
      ...body,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });
  }

  @Post('launch-prep')
  async prepareCampaignForReview(
    @CurrentUser() user: User,
    @Body()
    body: {
      adId: string;
      source: Exclude<AdsResearchSource, 'all'>;
      brandId?: string;
      brandName?: string;
      industry?: string;
      objective?: string;
      platform?: AdsResearchPlatform;
      channel?: AdsChannel;
      credentialId?: string;
      adAccountId?: string;
      loginCustomerId?: string;
      dailyBudget?: number;
      campaignName?: string;
      createWorkflow?: boolean;
    },
  ) {
    return this.adsResearchService.prepareCampaignForReview({
      ...body,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });
  }
}
