import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  CreateCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { GoogleAdsMetricsParams } from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
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
} from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('services/google-ads')
export class GoogleAdsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly googleAdsOAuthService: GoogleAdsOAuthService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const publicMetadata = getPublicMetadata(user);
    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(createCredentialDto.brand),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const state = JSON.stringify({
      brandId: brand._id,
      organizationId: brand.organization,
      userId: publicMetadata.user,
    });

    await this.credentialsService.saveCredentials(
      brand,
      CredentialPlatform.GOOGLE_ADS,
      {
        isConnected: false,
      },
    );

    const url = this.googleAdsOAuthService.generateAuthUrl(state);
    return serializeSingle(request, CredentialOAuthSerializer, { url });
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() body: Partial<CreateCredentialVerifyDto>,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    if (!body.code || !body.state) {
      throw new HttpException(
        {
          detail: 'Missing required OAuth parameters',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { brandId, organizationId } = JSON.parse(body.state);
    const credential = await this.credentialsService.findOne({
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.GOOGLE_ADS,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'Google Ads credential not found',
          title: 'OAuth Error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tokens =
      await this.googleAdsOAuthService.exchangeAuthCodeForAccessToken(
        body.code,
      );
    const customers = await this.googleAdsService.listAccessibleCustomers(
      tokens.accessToken,
    );
    const primaryCustomer = customers[0];

    const updatedCredential = await this.credentialsService.patch(
      credential._id,
      {
        accessToken: tokens.accessToken,
        accessTokenExpiry: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : undefined,
        externalHandle: primaryCustomer?.descriptiveName || 'Google Ads',
        externalId: primaryCustomer?.id,
        externalName: primaryCustomer?.descriptiveName || 'Google Ads',
        isConnected: true,
        isDeleted: false,
        refreshToken: tokens.refreshToken,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  @Get('oauth/url')
  getOAuthUrl(@Query('state') state: string) {
    return { url: this.googleAdsOAuthService.generateAuthUrl(state) };
  }

  @Post('oauth/callback')
  async handleOAuthCallback(@Body() body: { code: string; state?: string }) {
    if (body.state) {
      const tokens =
        await this.googleAdsOAuthService.exchangeAuthCodeForAccessToken(
          body.code,
        );
      return tokens;
    }

    return this.googleAdsOAuthService.exchangeAuthCodeForAccessToken(body.code);
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

    if (!credential?.accessToken) {
      throw new Error(
        'Google Ads credential not found. Please connect your Google Ads account first.',
      );
    }

    // Decrypt the stored token
    return EncryptionUtil.decrypt(credential.accessToken);
  }
}
