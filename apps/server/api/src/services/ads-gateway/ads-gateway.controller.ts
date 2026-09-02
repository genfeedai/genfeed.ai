import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { AdsGatewayRequestContextService } from '@api/services/ads-gateway/ads-gateway-request-context.service';
import {
  type AdsInsightsDateQuery,
  parseAdsInsightsQuery,
} from '@api/services/ads-gateway/ads-insights-range.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import type { AdsInsightsParams } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

/** Session roles allowed to read tenant ads analytics. */
const ADS_READ_ROLES = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.ANALYTICS,
] as const;

/**
 * API-key scopes are cumulative with the role check above — `RolesGuard` still
 * demands an active membership with an allowed role, so a scope can never
 * substitute for one.
 */
const ADS_READ_SCOPES = [
  ApiKeyScope.ANALYTICS_READ,
  ApiKeyScope.ADMIN,
] as const;

@AutoSwagger()
@Controller('ads')
@UseGuards(RolesGuard)
export class AdsGatewayController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly adsGatewayService: AdsGatewayService,
    private readonly requestContextService: AdsGatewayRequestContextService,
    private readonly logger: LoggerService,
  ) {}

  // ─── Read Endpoints ──────────────────────────────────────────────────────

  @Get('compare')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async comparePlatforms(
    @CurrentUser() user: User,
    @Query('platforms') platformsStr: string,
    @Query('credentialIds') credentialIdsStr: string,
    @Query('adAccountIds') adAccountIdsStr: string,
    @Query('datePreset') datePreset?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('loginCustomerIds') loginCustomerIdsStr?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started`);

    const platforms = platformsStr.split(',');
    const credentialIds = credentialIdsStr.split(',');
    const adAccountIds = adAccountIdsStr.split(',');
    const loginCustomerIds = loginCustomerIdsStr?.split(',');

    if (
      platforms.length !== credentialIds.length ||
      platforms.length !== adAccountIds.length
    ) {
      throw new BadRequestException(
        'platforms, credentialIds, and adAccountIds must have the same number of elements',
      );
    }

    const validPlatforms = platforms.map((platform) =>
      this.requestContextService.validatePlatform(platform),
    );
    const insightsParams = this.buildInsightsParams({
      datePreset,
      since,
      until,
    });

    const contexts = await Promise.all(
      validPlatforms.map(async (platform, index) => ({
        ctx: await this.requestContextService.createAdapterContext(
          user,
          platform,
          {
            adAccountId: adAccountIds[index],
            credentialId: credentialIds[index],
            loginCustomerId: loginCustomerIds?.[index],
          },
        ),
        platform,
      })),
    );

    return this.adsGatewayService.comparePlatforms(contexts, insightsParams);
  }

  @Get(':platform/accounts')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async getAdAccounts(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      {
        adAccountId: '',
        credentialId,
        loginCustomerId,
      },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.getAdAccounts(ctx);
  }

  @Get(':platform/campaigns')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async listCampaigns(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.listCampaigns(ctx);
  }

  @Get(':platform/campaigns/:campaignId/insights')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async getCampaignInsights(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('campaignId') campaignId: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('datePreset') datePreset?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const insightsParams = this.buildInsightsParams({
      datePreset,
      since,
      until,
    });
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.getCampaignInsights(ctx, campaignId, insightsParams);
  }

  @Get(':platform/adsets/:adSetId/insights')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async getAdSetInsights(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('adSetId') adSetId: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('datePreset') datePreset?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const insightsParams = this.buildInsightsParams({
      datePreset,
      since,
      until,
    });
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.getAdSetInsights(ctx, adSetId, insightsParams);
  }

  @Get(':platform/ads/:adId/insights')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async getAdInsights(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('adId') adId: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('datePreset') datePreset?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const insightsParams = this.buildInsightsParams({
      datePreset,
      since,
      until,
    });
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.getAdInsights(ctx, adId, insightsParams);
  }

  @Get(':platform/top-performers')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async getTopPerformers(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('metric') metric?: string,
    @Query('limit') limit?: string,
    @Query('datePreset') datePreset?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.getTopPerformers(ctx, {
      datePreset,
      limit: limit ? Number(limit) : undefined,
      metric,
    });
  }

  @Get(':platform/adsets')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async listAdSets(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('campaignId') campaignId: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.listAdSets(ctx, campaignId);
  }

  @Get(':platform/ads')
  @RolesDecorator(...ADS_READ_ROLES)
  @RequiredScopes(...ADS_READ_SCOPES)
  async listAds(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Query('credentialId') credentialId: string,
    @Query('adAccountId') adAccountId: string,
    @Query('adSetId') adSetId?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const validPlatform = this.requestContextService.validatePlatform(platform);
    const ctx = await this.requestContextService.createAdapterContext(
      user,
      validPlatform,
      { adAccountId, credentialId, loginCustomerId },
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);

    return adapter.listAds(ctx, adSetId);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Runs before credential resolution and adapter lookup so malformed,
   * unknown, mixed, or reversed insight dates never reach a provider.
   */
  private buildInsightsParams(query: AdsInsightsDateQuery): AdsInsightsParams {
    const parsed = parseAdsInsightsQuery(query);
    if (!parsed.isValid) {
      throw new BadRequestException(parsed.message);
    }

    return parsed.params;
  }
}
