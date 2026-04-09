import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type {
  CreateAdParams,
  CreateAdSetParams,
  CreateCampaignParams,
  MetaInsightsParams,
  UpdateAdSetParams,
  UpdateCampaignParams,
} from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('services/meta-ads')
export class MetaAdsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly metaAdsService: MetaAdsService,
  ) {}

  @Get('accounts')
  async getAdAccounts(@CurrentUser() user: User) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.metaAdsService.getAdAccounts(accessToken);
  }

  @Get('campaigns')
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
  async createCampaign(
    @CurrentUser() user: User,
    @Body() body: { adAccountId: string } & CreateCampaignParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const { adAccountId, ...params } = body;
    const accessToken = await this.getAccessTokenFromCredential(user);
    const id = await this.metaAdsService.createCampaign(
      accessToken,
      adAccountId,
      params,
    );
    return { id };
  }

  @Patch('campaigns/:id')
  async updateCampaign(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() body: UpdateCampaignParams,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.updateCampaign(accessToken, campaignId, body);
    return { success: true };
  }

  @Post('campaigns/:id/pause')
  async pauseCampaign(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.pauseCampaign(accessToken, campaignId);
    return { success: true };
  }

  @Patch('campaigns/:id/budget')
  async updateCampaignBudget(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Body() body: { dailyBudget?: number; lifetimeBudget?: number },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.updateCampaignBudget(
      accessToken,
      campaignId,
      body.dailyBudget,
      body.lifetimeBudget,
    );
    return { success: true };
  }

  @Post('adsets')
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
  async pauseAd(@CurrentUser() user: User, @Param('id') adId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.pauseAd(accessToken, adId);
    return { success: true };
  }

  @Delete('ads/:id')
  async deleteAd(@CurrentUser() user: User, @Param('id') adId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    await this.metaAdsService.deleteAd(accessToken, adId);
    return { success: true };
  }

  @Post('media/image')
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
   * Extract the Facebook access token from the user's credentials.
   * Meta Ads reuses the existing Facebook OAuth credential stored in the database.
   * Token is encrypted at rest and decrypted when retrieved.
   */
  private async getAccessTokenFromCredential(user: User): Promise<string> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization as string;
    const userId = publicMetadata.user as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.FACEBOOK,
      user: new Types.ObjectId(userId),
    });

    if (!credential?.accessToken) {
      throw new NotFoundException(
        'Facebook credential not found. Please connect your Facebook account first.',
      );
    }

    // Decrypt the stored token
    return EncryptionUtil.decrypt(credential.accessToken);
  }
}
