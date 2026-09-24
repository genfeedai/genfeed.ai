import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AdsDiscoveryService } from '@api/endpoints/ads-research/ads-discovery.service';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { PaidCreativePlatformReadiness } from '@api/services/paid-creative-research/interfaces/paid-creative-research.interface';
import { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import {
  AdsPlatform,
  type AdWatchlistPlatform,
} from '@genfeedai/contracts/interfaces';
import type {
  AdsChannel,
  AdsResearchMetric,
  AdsResearchPlatform,
  AdsResearchSource,
  AdsResearchTimeframe,
} from '@genfeedai/contracts/interfaces/integrations/ads-research.interface';
import { AdsDiscoverySerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

@AutoSwagger()
@Controller('ads/research')
@UseGuards(RolesGuard)
export class AdsResearchController {
  constructor(
    private readonly adsResearchService: AdsResearchService,
    private readonly paidCreativeProviderRegistry: PaidCreativeProviderRegistry,
    private readonly adsDiscoveryService: AdsDiscoveryService,
  ) {}

  /**
   * Per-platform state of the competitor archives the watchlist polls.
   *
   * Deliberately unfiltered: the blocked platforms are the ones an operator
   * most needs to see, because a watch row on an unavailable archive will
   * never produce creative and the UI has to say so instead of showing an
   * empty list that reads like "no competitor is running ads".
   */
  @Get('discover')
  async discover(
    @CurrentUser() user: User,
    @Query('brandId') brandId?: string,
    @Query('keyword') keyword?: string,
    @Query('platform') platform?: AdWatchlistPlatform,
    @Query('countries') countries?: string,
    @Query('limit') limit?: string,
    @Query('mediaType') mediaType?: 'visual' | 'image' | 'video',
  ) {
    const authorizedBrandId = this.resolveAuthorizedBrandId(user, brandId);
    return AdsDiscoverySerializer.serialize(
      await this.adsDiscoveryService.discover(user.organizationId, {
        brandId: authorizedBrandId,
        keyword: keyword ?? '',
        mediaType,
        platform: platform ?? AdsPlatform.META,
        countries,
        limit: limit === undefined ? undefined : Number(limit),
      }),
    );
  }

  @Get('watchlist-readiness')
  listWatchlistReadiness(): PaidCreativePlatformReadiness[] {
    return this.paidCreativeProviderRegistry.getReadiness();
  }

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
    const authorizedBrandId = this.resolveAuthorizedBrandId(user, brandId);
    return this.adsResearchService.listAds(user.organizationId, {
      adAccountId,
      brandId: authorizedBrandId,
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
    @Query('brandId') brandId?: string,
  ) {
    return this.adsResearchService.getAdDetail(user.organizationId, {
      adAccountId,
      brandId: this.resolveAuthorizedBrandId(user, brandId),
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
    const brandId = this.resolveAuthorizedBrandId(user, body.brandId);
    return this.adsResearchService.generateAdPack(user.organizationId, {
      ...body,
      brandId,
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
    const brandId = this.resolveAuthorizedBrandId(user, body.brandId);
    return this.adsResearchService.createRemixWorkflow({
      ...body,
      brandId,
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
    const brandId = this.resolveAuthorizedBrandId(user, body.brandId);
    return this.adsResearchService.prepareCampaignForReview({
      ...body,
      brandId,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });
  }

  private resolveAuthorizedBrandId(
    user: User,
    requestedBrandId?: string,
  ): string | undefined {
    if (requestedBrandId && !isEntityId(requestedBrandId)) {
      throw new BadRequestException('brandId is invalid');
    }

    const candidate = requestedBrandId ?? user.brandId;
    if (!candidate) {
      return undefined;
    }

    const authorized = CollectionFilterUtil.buildAuthorizedBrandFilter(
      candidate,
      user,
      getIsSuperAdmin(user),
    );
    if (typeof authorized !== 'string') {
      throw new ForbiddenException('An authenticated brand is required');
    }

    return authorized;
  }
}
