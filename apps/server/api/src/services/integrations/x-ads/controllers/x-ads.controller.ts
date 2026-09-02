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
import { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
import { XAdsOAuthService } from '@api/services/integrations/x-ads/services/x-ads-oauth.service';
import { CredentialPlatform, MemberRole } from '@genfeedai/contracts';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadGatewayException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

function safeOAuthErrorMetadata(error: unknown): {
  name: string;
  status?: number;
} {
  if (error instanceof HttpException) {
    return { name: error.name, status: error.getStatus() };
  }
  if (error instanceof Error) {
    return { name: error.name };
  }
  return { name: 'UnknownError' };
}

/**
 * X Ads connect/verify — role-gated like `GoogleAdsController`, with the
 * provider-required three-legged OAuth 1.0a request-token flow. Organic X uses
 * a separate platform and OAuth 2.0 credential contract.
 */
@AutoSwagger()
@Controller('services/x-ads')
@UseGuards(RolesGuard)
export class XAdsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly xAdsOAuthService: XAdsOAuthService,
    private readonly xAdsService: XAdsService,
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
      isDeleted: false,
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

    try {
      // Validate application configuration and obtain the provider request
      // token before creating a pending database row. Missing or placeholder
      // deployment credentials therefore fail without leaving orphan state.
      const { oauthToken, oauthTokenSecret, url } =
        await this.xAdsOAuthService.generateAuthLink();

      const { credential } = await this.credentialsService.beginOAuthForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.X_ADS,
        { isConnected: false },
      );

      await this.credentialsService.attachOAuth1RequestToken(
        credential.id,
        CredentialPlatform.X_ADS,
        {
          organizationId: user.organizationId,
          userId: user.userId ?? user.id,
        },
        oauthToken,
        oauthTokenSecret,
      );

      return serializeSingle(request, CredentialOAuthSerializer, { url });
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeOAuthErrorMetadata(error),
      );
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new HttpException(
        {
          detail: 'Failed to initiate X Ads OAuth',
          title: 'Connection Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

    if (!body.oauthToken || !body.oauthVerifier) {
      throw new HttpException(
        {
          detail: 'Missing required OAuth 1.0a parameters',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const credential =
        await this.credentialsService.findPendingOAuth1Credential(
          body.oauthToken,
          CredentialPlatform.X_ADS,
          {
            organizationId: user.organizationId,
            userId: user.userId ?? user.id,
          },
        );

      if (!credential) {
        throw new HttpException(
          { detail: 'X Ads credential not found', title: 'OAuth Error' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const requestToken = credential.oauthToken
        ? EncryptionUtil.decrypt(credential.oauthToken)
        : null;
      const requestTokenSecret = credential.oauthTokenSecret
        ? EncryptionUtil.decrypt(credential.oauthTokenSecret)
        : null;

      if (!requestToken || !requestTokenSecret) {
        throw new HttpException(
          {
            detail: 'Missing OAuth 1.0a request-token credentials',
            title: 'OAuth Error',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const tokens = await this.xAdsOAuthService.exchangeRequestToken(
        requestToken,
        requestTokenSecret,
        body.oauthVerifier,
      );

      const accounts = await this.xAdsService.getAdAccounts({
        accessToken: tokens.accessToken,
        accessTokenSecret: tokens.accessTokenSecret,
      });
      // The OAuth token can cover multiple accounts, while the credential has
      // one display identity and every Ads operation still requires an
      // explicitly validated adAccountId. Provider order is not contractual,
      // so choose the stable lowest account id for credential metadata only.
      const primaryAccount = [...accounts].sort((left, right) =>
        left.id.localeCompare(right.id),
      )[0];
      if (!primaryAccount) {
        throw new BadGatewayException({
          detail:
            'X authorized successfully but did not return an accessible Ads account.',
          title: 'X Ads account unavailable',
        });
      }

      // The Ads account id is the identity — an agency brand routinely runs
      // more than one.
      const updatedCredential = await this.credentialsService.connectAccount(
        credential.id,
        credential.organizationId,
        {
          handle: primaryAccount.name || 'X Ads',
          id: primaryAccount.id,
          name: primaryAccount.name || 'X Ads',
        },
        {
          accessToken: tokens.accessToken,
          accessTokenExpiry: null,
          accessTokenSecret: tokens.accessTokenSecret,
          grantedScopes: [],
          grantedScopesCapturedAt: null,
          oauthToken: null,
          oauthTokenHash: null,
          oauthTokenSecret: null,
          refreshToken: null,
          refreshTokenExpiry: null,
        },
      );

      return serializeSingle(request, CredentialSerializer, updatedCredential);
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        safeOAuthErrorMetadata(error),
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadGatewayException({
        detail: 'Failed to verify the X Ads connection. Please try again.',
        title: 'Connection Error',
      });
    }
  }
}
