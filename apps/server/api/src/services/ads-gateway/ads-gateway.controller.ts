import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import {
  INVALID_CAMPAIGN_STATUS_MESSAGE,
  isAcceptedCampaignStatus,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import { mapAdsCredentialPlatform } from '@api/services/ads-gateway/ads-credential-platform.util';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import {
  ApiKeyScope,
  MemberRole,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import type {
  AdsAdapterContext,
  AdsInsightsParams,
  AdsPlatform,
  CreateAdInput,
  CreateAdSetInput,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

const VALID_PLATFORMS: AdsPlatform[] = ['meta', 'google', 'tiktok', 'x'];

/** Session roles allowed to read tenant ads analytics. */
const ADS_READ_ROLES = [
  MemberRole.OWNER,
  MemberRole.ADMIN,
  MemberRole.ANALYTICS,
] as const;

/** Session roles allowed to write paid-media drafts. */
const ADS_WRITE_ROLES = [MemberRole.OWNER, MemberRole.ADMIN] as const;

/**
 * API-key scopes are cumulative with the role check above — `RolesGuard` still
 * demands an active membership with an allowed role, so a scope can never
 * substitute for one.
 */
const ADS_READ_SCOPES = [
  ApiKeyScope.ANALYTICS_READ,
  ApiKeyScope.ADMIN,
] as const;
const ADS_WRITE_SCOPES = [ApiKeyScope.ADMIN] as const;

@AutoSwagger()
@Controller('ads')
@UseGuards(RolesGuard)
export class AdsGatewayController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly adsGatewayService: AdsGatewayService,
    private readonly credentialsService: CredentialsService,
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
    @Query('loginCustomerIds') loginCustomerIdsStr?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started`);

    const reqCtx = extractRequestContext(user);
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
      this.validatePlatform(platform),
    );

    const accessTokens = await Promise.all(
      validPlatforms.map((platform, index) =>
        this.resolveAccessToken(
          credentialIds[index],
          reqCtx.organizationId,
          platform,
        ),
      ),
    );

    const contexts = validPlatforms.map((platform, i) => ({
      ctx: this.buildContext({
        accessToken: accessTokens[i],
        adAccountId: adAccountIds[i],
        credentialId: credentialIds[i],
        loginCustomerId: loginCustomerIds?.[i],
        organizationId: reqCtx.organizationId,
      }),
      platform,
    }));

    return this.adsGatewayService.comparePlatforms(contexts, datePreset);
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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId: '',
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.getCampaignInsights(
      ctx,
      campaignId,
      this.buildInsightsParams({ datePreset, since, until }),
    );
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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.getAdSetInsights(
      ctx,
      adSetId,
      this.buildInsightsParams({ datePreset, since, until }),
    );
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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.getAdInsights(
      ctx,
      adId,
      this.buildInsightsParams({ datePreset, since, until }),
    );
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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

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

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.listAds(ctx, adSetId);
  }

  // ─── Write Endpoints ──────────────────────────────────────────────────────

  @Post(':platform/campaigns')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  async createCampaign(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & CreateCampaignInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    this.assertPausedOnlyStatus(body.status);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.createCampaign(ctx, input);
  }

  @Put(':platform/campaigns/:campaignId')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  async updateCampaign(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Param('campaignId') campaignId: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & UpdateCampaignInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    this.assertPausedOnlyStatus(body.status);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.updateCampaign(ctx, campaignId, input);
  }

  @Post(':platform/adsets')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  async createAdSet(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & CreateAdSetInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.createAdSet(ctx, input);
  }

  @Post(':platform/ads')
  @RolesDecorator(...ADS_WRITE_ROLES)
  @RequiredScopes(...ADS_WRITE_SCOPES)
  async createAd(
    @CurrentUser() user: User,
    @Param('platform') platform: string,
    @Body()
    body: {
      credentialId: string;
      adAccountId: string;
      loginCustomerId?: string;
    } & CreateAdInput,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${caller} started for ${platform}`);

    const reqCtx = extractRequestContext(user);
    const validPlatform = this.validatePlatform(platform);
    const adapter = this.adsGatewayService.getAdapter(validPlatform);
    const { credentialId, adAccountId, loginCustomerId, ...input } = body;
    const accessToken = await this.resolveAccessToken(
      credentialId,
      reqCtx.organizationId,
      validPlatform,
    );
    const ctx = this.buildContext({
      accessToken,
      adAccountId,
      credentialId,
      loginCustomerId,
      organizationId: reqCtx.organizationId,
    });

    return adapter.createAd(ctx, input);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async resolveAccessToken(
    credentialId: string,
    organizationId: string,
    platform: AdsPlatform,
  ): Promise<string> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: toPrismaCredentialPlatform(mapAdsCredentialPlatform(platform)),
    });

    if (!credential?.accessToken) {
      throw new UnauthorizedException(
        `Credential ${credentialId} not found or missing access token`,
      );
    }

    return EncryptionUtil.decrypt(credential.accessToken);
  }

  private buildInsightsParams(query: {
    datePreset?: string;
    since?: string;
    until?: string;
  }): AdsInsightsParams {
    const params: AdsInsightsParams = {};
    if (query.datePreset) params.datePreset = query.datePreset;
    if (query.since && query.until)
      params.timeRange = { since: query.since, until: query.until };

    return params;
  }

  /**
   * Runs before credential resolution and adapter lookup so an activating
   * status never reaches a token, a provider, or a queue.
   */
  private assertPausedOnlyStatus(status: unknown): void {
    if (!isAcceptedCampaignStatus(status)) {
      throw new BadRequestException(INVALID_CAMPAIGN_STATUS_MESSAGE);
    }
  }

  private validatePlatform(platform: string): AdsPlatform {
    if (!VALID_PLATFORMS.includes(platform as AdsPlatform)) {
      throw new BadRequestException(
        `Invalid platform: ${platform}. Must be one of: ${VALID_PLATFORMS.join(', ')}`,
      );
    }
    return platform as AdsPlatform;
  }

  private buildContext(params: {
    credentialId: string;
    accessToken: string;
    adAccountId: string;
    loginCustomerId?: string;
    organizationId: string;
    brandId?: string;
  }): AdsAdapterContext {
    return {
      accessToken: params.accessToken,
      adAccountId: params.adAccountId,
      brandId: params.brandId,
      credentialId: params.credentialId,
      loginCustomerId: params.loginCustomerId,
      organizationId: params.organizationId,
    };
  }
}
