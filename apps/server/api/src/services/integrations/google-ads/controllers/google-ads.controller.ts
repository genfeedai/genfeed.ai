import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { GoogleAdsMetricsParams } from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { CredentialPlatform, MemberRole } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
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
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/google-ads')
@UseGuards(RolesGuard)
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
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const brand = await this.brandsService.findOne({
      id: createCredentialDto.brandId,
      organizationId: user.organizationId,
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

    this.googleAdsOAuthService.requireConfigured();

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.GOOGLE_ADS,
      {
        isConnected: false,
      },
    );

    const url = this.googleAdsOAuthService.generateAuthUrl(state);
    return serializeSingle(request, CredentialOAuthSerializer, { url });
  }

  @Post('verify')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async verify(
    @Req() request: Request,
    @CurrentUser() user: User,
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

    const credential = await this.credentialsService.findPendingOAuthCredential(
      body.state,
      CredentialPlatform.GOOGLE_ADS,
      {
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      },
    );

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

    // The customer id is the account identity — one brand may manage several
    // Google Ads customers.
    const updatedCredential = await this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId,
      {
        handle: primaryCustomer?.descriptiveName || 'Google Ads',
        id: primaryCustomer?.id,
        name: primaryCustomer?.descriptiveName || 'Google Ads',
      },
      {
        accessToken: tokens.accessToken,
        accessTokenExpiry: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : undefined,
        refreshToken: tokens.refreshToken,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  @Get('customers')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  async listCustomers(@CurrentUser() user: User) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const accessToken = await this.getAccessTokenFromCredential(user);
    return this.googleAdsService.listAccessibleCustomers(accessToken);
  }

  @Get('campaigns')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
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
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
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
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
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
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
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
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
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
    const organizationId = user.organizationId as string;
    const userId = (user.userId ?? user.id) as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      organizationId: organizationId,
      platform: CredentialPlatform.GOOGLE_ADS,
      userId: userId,
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
