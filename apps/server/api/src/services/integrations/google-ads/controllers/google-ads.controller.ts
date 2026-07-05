import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  CreateCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { GoogleAdsMetricsParams } from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, MemberRole } from '@genfeedai/enums';
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
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const publicMetadata = getPublicMetadata(user);
    const brand = await this.brandsService.findOne({
      _id: createCredentialDto.brand,
      isDeleted: false,
      organization: publicMetadata.organization,
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
      brandId: brand.id,
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

    const { brandId, organizationId } = JSON.parse(body.state);

    // Bind the OAuth state to the caller: the org encoded in the state must
    // match the authenticated caller's active organization. Prevents a member
    // of org A from completing a credential exchange scoped to org B.
    const callerOrganizationId = getPublicMetadata(user).organization;
    if (organizationId !== callerOrganizationId) {
      throw new HttpException(
        {
          detail: 'OAuth state does not match your organization',
          title: 'OAuth Error',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const credential = await this.credentialsService.findOne({
      brand: brandId,
      isDeleted: false,
      organization: organizationId,
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
      credential.id,
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
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  getOAuthUrl(@Query('state') state: string) {
    return { url: this.googleAdsOAuthService.generateAuthUrl(state) };
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
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization as string;
    const userId = publicMetadata.user as string;

    const credential = await this.credentialsService.findOne({
      isConnected: true,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.GOOGLE_ADS,
      user: userId,
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
