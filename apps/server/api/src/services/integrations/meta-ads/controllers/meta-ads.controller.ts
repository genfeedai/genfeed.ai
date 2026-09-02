import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  INVALID_CAMPAIGN_STATUS_MESSAGE,
  isAcceptedCampaignStatus,
  resolveProviderCampaignStatus,
  resolveProviderPausedStatus,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import type {
  CreateAdParams,
  CreateAdSetParams,
  CreateCampaignParams,
  MetaInsightsParams,
  UpdateAdSetParams,
  UpdateCampaignParams,
} from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { ApiKeyScope, CredentialPlatform, MemberRole } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

@AutoSwagger()
@Controller('services/meta-ads')
@UseGuards(RolesGuard)
export class MetaAdsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly metaAdsService: MetaAdsService,
  ) {}

  @Get('accounts')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async getAdAccounts(@CurrentUser() user: User) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.getAdAccounts(accessToken);
  }

  @Get('campaigns')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async listCampaigns(
    @CurrentUser() user: User,
    @Query('adAccountId') adAccountId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.listCampaigns(accessToken, adAccountId, {
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Get('campaigns/compare')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async compareCampaigns(
    @CurrentUser() user: User,
    @Query('campaignIds') campaignIds: string,
    @Query('datePreset') datePreset?: MetaInsightsParams['datePreset'],
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const ids = campaignIds.split(',');
    const params: MetaInsightsParams = {};
    if (datePreset) params.datePreset = datePreset;

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.compareCampaigns(accessToken, ids, params);
  }

  @Get('campaigns/:id/insights')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async getCampaignInsights(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Query('datePreset') datePreset?: MetaInsightsParams['datePreset'],
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const params: MetaInsightsParams = {};
    if (datePreset) params.datePreset = datePreset;
    if (since && until) params.timeRange = { since, until };

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.getCampaignInsights(
      accessToken,
      campaignId,
      params,
    );
  }

  @Get('adsets/:id/insights')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async getAdSetInsights(
    @CurrentUser() user: User,
    @Param('id') adSetId: string,
    @Query('datePreset') datePreset?: MetaInsightsParams['datePreset'],
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const params: MetaInsightsParams = {};
    if (datePreset) params.datePreset = datePreset;
    if (since && until) params.timeRange = { since, until };

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.getAdSetInsights(accessToken, adSetId, params);
  }

  @Get('ads/:id/insights')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async getAdInsights(
    @CurrentUser() user: User,
    @Param('id') adId: string,
    @Query('datePreset') datePreset?: MetaInsightsParams['datePreset'],
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const params: MetaInsightsParams = {};
    if (datePreset) params.datePreset = datePreset;
    if (since && until) params.timeRange = { since, until };

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.getAdInsights(accessToken, adId, params);
  }

  @Get('creatives')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async getAdCreatives(
    @CurrentUser() user: User,
    @Query('adAccountId') adAccountId: string,
    @Query('limit') limit?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.getAdCreatives(accessToken, adAccountId, {
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('top-performers')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  @RequiredScopes(ApiKeyScope.ANALYTICS_READ, ApiKeyScope.ADMIN)
  async getTopPerformers(
    @CurrentUser() user: User,
    @Query('adAccountId') adAccountId: string,
    @Query('metric') metric: string,
    @Query('limit') limit?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.getTopPerformers(
      accessToken,
      adAccountId,
      metric,
      limit ? Number(limit) : undefined,
    );
  }

  // ─── Write Endpoints ──────────────────────────────────────────────────────

  @Post('campaigns')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async createCampaign(
    @CurrentUser() user: User,
    @Body() body: { adAccountId: string } & CreateCampaignParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const { adAccountId, ...params } = body;
    this.assertPausedOnlyStatus(params.status);

    const accessToken = await this.getAccessTokenFromCredential(user);
    const id = await this.metaAdsService.createCampaign(
      accessToken,
      adAccountId,
      {
        ...params,
        // Sent explicitly rather than left to Meta's default so an omitted
        // status can never create a campaign that is able to spend.
        status: resolveProviderPausedStatus('meta'),
      },
    );
    return { id };
  }

  @Patch('campaigns/:id')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async updateCampaign(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() body: UpdateCampaignParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    this.assertPausedOnlyStatus(body.status);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.updateCampaign(accessToken, campaignId, {
      ...body,
      // Omitted stays omitted so a budget or rename edit never mutates the
      // campaign's serving state.
      status: resolveProviderCampaignStatus('meta', body.status),
    });
    return { success: true };
  }

  @Post('adsets')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async createAdSet(
    @CurrentUser() user: User,
    @Body() body: { adAccountId: string } & CreateAdSetParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const { adAccountId, ...params } = body;
    const accessToken = await this.getAccessTokenFromCredential(user);
    const id = await this.metaAdsService.createAdSet(
      accessToken,
      adAccountId,
      params,
    );
    return { id };
  }

  @Patch('adsets/:id')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async updateAdSet(
    @CurrentUser() user: User,
    @Param('id') adSetId: string,
    @Body() body: UpdateAdSetParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.updateAdSet(accessToken, adSetId, body);
    return { success: true };
  }

  @Post('ads')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async createAd(
    @CurrentUser() user: User,
    @Body() body: { adAccountId: string } & CreateAdParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const { adAccountId, ...params } = body;
    const accessToken = await this.getAccessTokenFromCredential(user);
    const id = await this.metaAdsService.createAd(
      accessToken,
      adAccountId,
      params,
    );
    return { id };
  }

  @Post('ads/:id/pause')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async pauseAd(@CurrentUser() user: User, @Param('id') adId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.pauseAd(accessToken, adId);
    return { success: true };
  }

  @Delete('ads/:id')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async deleteAd(@CurrentUser() user: User, @Param('id') adId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.deleteAd(accessToken, adId);
    return { success: true };
  }

  @Post('media/image')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async uploadAdImage(
    @CurrentUser() user: User,
    @Body() body: { adAccountId: string; imageUrl: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.uploadAdImage(
      accessToken,
      body.adAccountId,
      body.imageUrl,
    );
  }

  @Post('media/video')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @RequiredScopes(ApiKeyScope.ADMIN)
  async uploadAdVideo(
    @CurrentUser() user: User,
    @Body() body: { adAccountId: string; videoUrl: string; title?: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.uploadAdVideo(
      accessToken,
      body.adAccountId,
      body.videoUrl,
      body.title,
    );
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * The direct Meta routes reach the provider without the unified gateway, so
   * they enforce the same paused-only contract before a token is resolved.
   */
  private assertPausedOnlyStatus(status: unknown): void {
    if (!isAcceptedCampaignStatus(status)) {
      throw new BadRequestException(INVALID_CAMPAIGN_STATUS_MESSAGE);
    }
  }

  /**
   * Extract the Facebook access token from the user's credentials.
   * Meta Ads reuses the existing Facebook OAuth credential stored in the database.
   * Token is encrypted at rest and decrypted when retrieved.
   */
  private async getAccessTokenFromCredential(user: User): Promise<string> {
    const organizationId = user.organizationId as string;
    const userId = (user.userId ?? user.id) as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      organizationId: organizationId,
      platform: CredentialPlatform.FACEBOOK,
      userId: userId,
    });

    if (!credential?.accessToken) {
      throw new NotFoundException({
        message:
          'Facebook credential not found. Please connect your Facebook account first.',
      });
    }

    // Decrypt the stored token
    return EncryptionUtil.decrypt(credential.accessToken);
  }
}
