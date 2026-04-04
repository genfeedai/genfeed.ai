import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { GoogleAdsMetricsParams } from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('services/google-ads')
export class GoogleAdsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly googleAdsOAuthService: GoogleAdsOAuthService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('oauth/url')
  getOAuthUrl(@Query('state') state: string) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const url = this.googleAdsOAuthService.generateAuthUrl(state);
    return { url };
  }

  @Post('oauth/callback')
  async handleOAuthCallback(@Body() body: { code: string }) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const tokens =
      await this.googleAdsOAuthService.exchangeAuthCodeForAccessToken(
        body.code,
      );
    return tokens;
  }

  @Get('customers')
  async listCustomers(@CurrentUser() user: User) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.googleAdsService.listAccessibleCustomers(accessToken);
  }

  @Get('campaigns')
  async listCampaigns(
    @CurrentUser() user: User,
    @Query('customerId') customerId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.googleAdsService.listCampaigns(
      accessToken,
      customerId,
      { limit: limit ? Number(limit) : undefined, status },
      loginCustomerId,
    );
  }

  @Get('campaigns/:id/metrics')
  async getCampaignMetrics(
    @CurrentUser() user: User,
    @Param('id') campaignId: string,
    @Query('customerId') customerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('segmentByDate') segmentByDate?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const params: GoogleAdsMetricsParams = {};
    if (startDate && endDate) {
      params.dateRange = { endDate, startDate };
    }
    if (segmentByDate === 'true') {
      params.segmentByDate = true;
    }
    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.googleAdsService.getCampaignMetrics(
      accessToken,
      customerId,
      campaignId,
      params,
      loginCustomerId,
    );
  }

  @Get('ad-groups/:id/insights')
  async getAdGroupInsights(
    @CurrentUser() user: User,
    @Param('id') adGroupId: string,
    @Query('customerId') customerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const params: GoogleAdsMetricsParams = {};
    if (startDate && endDate) {
      params.dateRange = { endDate, startDate };
    }
    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.googleAdsService.getAdGroupInsights(
      accessToken,
      customerId,
      adGroupId,
      params,
      loginCustomerId,
    );
  }

  @Get('keywords')
  async getKeywordPerformance(
    @CurrentUser() user: User,
    @Query('customerId') customerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const params: GoogleAdsMetricsParams = {};
    if (startDate && endDate) {
      params.dateRange = { endDate, startDate };
    }
    if (limit) {
      params.limit = Number(limit);
    }
    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.googleAdsService.getKeywordPerformance(
      accessToken,
      customerId,
      params,
      loginCustomerId,
    );
  }

  @Get('search-terms/:campaignId')
  async getSearchTerms(
    @CurrentUser() user: User,
    @Param('campaignId') campaignId: string,
    @Query('customerId') customerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('loginCustomerId') loginCustomerId?: string,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const params: GoogleAdsMetricsParams = {};
    if (startDate && endDate) {
      params.dateRange = { endDate, startDate };
    }
    if (limit) {
      params.limit = Number(limit);
    }
    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.googleAdsService.getSearchTermsReport(
      accessToken,
      customerId,
      campaignId,
      params,
      loginCustomerId,
    );
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Extract the Google Ads access token from the user's credentials.
   * Token is encrypted at rest in the database and decrypted when retrieved.
   */
  private async getAccessTokenFromCredential(user: User): Promise<string> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization as string;
    const userId = publicMetadata.user as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.GOOGLE_ADS,
      user: new Types.ObjectId(userId),
    });

    if (!credential?.oauthToken) {
      throw new Error(
        'Google Ads credential not found. Please connect your Google Ads account first.',
      );
    }

    // Decrypt the stored token
    return EncryptionUtil.decrypt(credential.oauthToken);
  }
}
