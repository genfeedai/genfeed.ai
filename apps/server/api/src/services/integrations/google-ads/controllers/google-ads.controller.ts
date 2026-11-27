import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  claimOAuthVerifyCredential,
  verifiedOAuthState,
} from '@api/collections/credentials/utils/oauth-verify-claim.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { SelectGoogleAdsAccountDto } from '@api/services/integrations/google-ads/dto/select-google-ads-account.dto';
import {
  GoogleAdsMetricsParams,
  type GoogleAdsSelectableAccount,
} from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsAccountsService } from '@api/services/integrations/google-ads/services/google-ads-accounts.service';
import { GoogleAdsOAuthService } from '@api/services/integrations/google-ads/services/google-ads-oauth.service';
import {
  ApiKeyScope,
  CredentialPlatform,
  MemberRole,
} from '@genfeedai/contracts';
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
    private readonly googleAdsAccountsService: GoogleAdsAccountsService,
    private readonly googleAdsOAuthService: GoogleAdsOAuthService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('connect')
  @RequiredScopes(ApiKeyScope.ADMIN)
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
  @RequiredScopes(ApiKeyScope.ADMIN)
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

    const claim = await claimOAuthVerifyCredential(
      this.credentialsService,
      body.state,
      CredentialPlatform.GOOGLE_ADS,
      {
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      },
    );
    if (claim?.alreadyConnected) {
      return serializeSingle(request, CredentialSerializer, claim.credential);
    }
    const credential = claim?.credential;

    if (!credential) {
      throw new HttpException(
        {
          detail: 'Google Ads credential not found',
          title: 'OAuth Error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let tokens: Awaited<
      ReturnType<GoogleAdsOAuthService['exchangeAuthCodeForAccessToken']>
    >;
    try {
      tokens = await this.googleAdsOAuthService.exchangeAuthCodeForAccessToken(
        body.code,
      );
    } catch (error: unknown) {
      throw this.googleAdsAccountsService.toVerifyException(
        error,
        'Token exchange failed',
      );
    }

    let accounts: GoogleAdsSelectableAccount[];
    try {
      accounts = await this.googleAdsAccountsService.listSelectable(
        tokens.accessToken,
      );
    } catch (error: unknown) {
      throw this.googleAdsAccountsService.toVerifyException(
        error,
        'Customer lookup failed',
      );
    }

    // A manager account groups other accounts and has no campaigns, so a
    // login that reaches only managers (or nothing) has nothing to connect.
    if (accounts.length === 0) {
      throw new HttpException(
        {
          detail:
            'This Google login has no Google Ads account with campaigns. A manager account has none of its own: create a client account in Google Ads, then connect again.',
          title: 'No Google Ads account to connect',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const connection = {
      accessToken: tokens.accessToken,
      accessTokenExpiry: tokens.expiresIn
        ? new Date(Date.now() + tokens.expiresIn * 1000)
        : undefined,
      refreshToken: tokens.refreshToken,
    };

    // One account connects at once. With several there is no safe default, so
    // the credential keeps its token and waits for
    // `POST :credentialId/select-account`; the serialized credential reports
    // `needsAccountSelection`.
    const [only] = accounts;
    if (accounts.length === 1 && only) {
      const connected = await this.googleAdsAccountsService.connectAccount(
        credential,
        only,
        connection,
      );
      return serializeSingle(request, CredentialSerializer, connected);
    }

    const pending = await this.credentialsService.patch(credential.id, {
      accessToken: connection.accessToken,
      accessTokenExpiry: connection.accessTokenExpiry,
      isConnected: false,
      isDeleted: false,
      oauthState: verifiedOAuthState(body.state),
      refreshToken: connection.refreshToken,
    });
    return serializeSingle(request, CredentialSerializer, pending);
  }

  /** The accounts a pending connection can still choose from. */
  @TenantReadPolicy('owner')
  @Get(':credentialId/accounts')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async listAccounts(
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    return {
      accounts: await this.googleAdsAccountsService.listForPending(
        user,
        credentialId,
      ),
    };
  }

  /** Settle a pending connection onto the chosen account. */
  @Post(':credentialId/select-account')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  async selectAccount(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
    @Body() body: SelectGoogleAdsAccountDto,
  ) {
    const connected = await this.googleAdsAccountsService.selectForPending(
      user,
      credentialId,
      body.customerId,
    );
    return serializeSingle(request, CredentialSerializer, connected);
  }

  @TenantReadPolicy('owner')
  @Get('customers')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ANALYTICS)
  async listCustomers(@CurrentUser() user: User) {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} started`);

    const { accessToken } = await this.getCredentialContext(user);
    return this.googleAdsService.listAccessibleCustomers(accessToken);
  }

  @TenantReadPolicy('owner')
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

    const context = await this.getCredentialContext(user, loginCustomerId);
    return this.googleAdsService.listCampaigns(
      context.accessToken,
      customerId,
      { limit: limit ? Number(limit) : undefined, status },
      context.loginCustomerId,
    );
  }

  @TenantReadPolicy('owner')
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
    const context = await this.getCredentialContext(user, loginCustomerId);
    return this.googleAdsService.getCampaignMetrics(
      context.accessToken,
      customerId,
      campaignId,
      params,
      context.loginCustomerId,
    );
  }

  @TenantReadPolicy('owner')
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
    const context = await this.getCredentialContext(user, loginCustomerId);
    return this.googleAdsService.getAdGroupInsights(
      context.accessToken,
      customerId,
      adGroupId,
      params,
      context.loginCustomerId,
    );
  }

  @TenantReadPolicy('owner')
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
    const context = await this.getCredentialContext(user, loginCustomerId);
    return this.googleAdsService.getKeywordPerformance(
      context.accessToken,
      customerId,
      params,
      context.loginCustomerId,
    );
  }

  @TenantReadPolicy('owner')
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
    const context = await this.getCredentialContext(user, loginCustomerId);
    return this.googleAdsService.getSearchTermsReport(
      context.accessToken,
      customerId,
      campaignId,
      params,
      context.loginCustomerId,
    );
  }

  // Private Helpers

  /**
   * Extract the Google Ads access token from the user's credentials.
   * Token is encrypted at rest in the database and decrypted when retrieved.
   */
  /**
   * The token and `login-customer-id` for a read. A client reached through a
   * manager was stored with that manager's id; an explicit caller value wins.
   */
  private async getCredentialContext(
    user: User,
    loginCustomerId?: string,
  ): Promise<{ accessToken: string; loginCustomerId?: string }> {
    const credential = await this.findConnectedCredential(user);
    return {
      accessToken: EncryptionUtil.decrypt(credential.accessToken as string),
      loginCustomerId:
        loginCustomerId || credential.externalParentId || undefined,
    };
  }

  private async findConnectedCredential(
    user: User,
  ): Promise<{ accessToken: string; externalParentId?: string | null }> {
    const credential = await this.credentialsService.findOneSelect(
      {
        isConnected: true,
        organizationId: user.organizationId as string,
        platform: CredentialPlatform.GOOGLE_ADS,
        userId: (user.userId ?? user.id) as string,
      },
      { accessToken: true, externalParentId: true },
    );

    if (!credential?.accessToken) {
      throw new NotFoundException({
        message:
          'Google Ads credential not found. Please connect your Google Ads account first.',
      });
    }

    return {
      accessToken: credential.accessToken,
      externalParentId: credential.externalParentId,
    };
  }
}
