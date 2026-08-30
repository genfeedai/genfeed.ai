import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@server/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { InstagramService } from '@server/services/integrations/instagram/services/instagram.service';
import {
  getSafeInstagramOAuthErrorLog,
  throwMappedInstagramOAuthError,
} from '@server/services/integrations/instagram/utils/instagram-error.util';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

interface InstagramShortLivedTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

interface InstagramLongLivedTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

@AutoSwagger()
@Controller('services/instagram')
export class InstagramController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly redirectUri: string;

  private readonly graphUrl: string = 'https://graph.facebook.com';
  private readonly apiVersion: string;
  private readonly scope = [
    'business_management',
    'instagram_basic',
    'pages_show_list',
    'pages_read_engagement',
    'instagram_content_publish',
    'instagram_manage_insights',
    'pages_manage_posts',
    'public_profile',
    'ads_management',
  ];

  constructor(
    private readonly configService: ConfigService,

    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly instagramService: InstagramService,
    private readonly instagramAuthorizedSignalsService: InstagramAuthorizedSignalsService,
    private readonly loggerService: LoggerService,
  ) {
    this.redirectUri = this.configService.get('INSTAGRAM_REDIRECT_URI') ?? '';
    this.apiVersion =
      this.configService.get('INSTAGRAM_API_VERSION') || 'v24.0';
  }

  /**
   * Step 1: Get Instagram OAuth URL for user to connect their brand.
   * This will allow us to request permissions to publish on their behalf.
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialDto);

    const brand = await this.brandsService.findOne({
      id: createCredentialDto.brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    const appId = this.configService.get('INSTAGRAM_APP_ID');
    const redirectUri =
      this.configService.get('INSTAGRAM_REDIRECT_URI') ?? this.redirectUri;
    if (
      !appId ||
      !redirectUri ||
      isUnconfiguredSecret(appId) ||
      isUnconfiguredSecret(redirectUri)
    ) {
      throw new ServiceUnavailableException(
        'Instagram OAuth is not configured for this deployment.',
      );
    }

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.INSTAGRAM,
      {
        accessToken: undefined,
        isConnected: false,
        oauthToken: undefined,
        oauthTokenSecret: undefined,
      },
    );

    this.loggerService.log(`${url} - Generating OAuth URL`, {
      appId: 'configured',
      redirectUri,
    });

    // Facebook/Instagram OAuth endpoint
    const authUrl =
      `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(this.scope.join(','))}` +
      `&response_type=code&state=${encodeURIComponent(state)}`;

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  /**
   * Step 2: Handle the OAuth callback, exchange code for a long-lived access token,
   * and save it to the database. The user will select their Instagram brand later.
   */
  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() createCredentialVerifyDto: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, {
      hasCode: Boolean(createCredentialVerifyDto.code),
      hasState: Boolean(createCredentialVerifyDto.state),
    });
    let failureStage = 'request_validation';

    try {
      const { code, state } = createCredentialVerifyDto;

      if (!code || !state) {
        return returnBadRequest({
          detail: 'Missing code or identifiers',
          title: 'Invalid payload',
        });
      }

      failureStage = 'credential_lookup';
      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.INSTAGRAM,
        );

      if (!existingCredential) {
        return returnNotFound(
          'Pending OAuth credential',
          'for this OAuth state',
        );
      }

      // 1. Exchange code for short-lived user access token
      failureStage = 'configuration';
      const appId = this.configService.get('INSTAGRAM_APP_ID');
      const appSecret = this.configService.get('INSTAGRAM_APP_SECRET');

      if (
        !appId ||
        !appSecret ||
        isUnconfiguredSecret(appId) ||
        isUnconfiguredSecret(appSecret)
      ) {
        throw new ServiceUnavailableException(
          'Instagram OAuth is not configured for this deployment.',
        );
      }

      // Authorization codes expire quickly (10-60 seconds) and can only be used once
      // The redirect_uri must match EXACTLY (including protocol, domain, path, trailing slashes)
      failureStage = 'short_lived_token';
      // Use POST method as per OAuth 2.0 specification and Facebook's recommendation
      const tokenRes: AxiosResponse<InstagramShortLivedTokenResponse> =
        await firstValueFrom(
          this.httpService.post(
            `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
            null,
            {
              params: {
                client_id: appId,
                client_secret: appSecret,
                code,
                redirect_uri: this.redirectUri,
              },
            },
          ),
        );

      const shortLivedToken = tokenRes.data.access_token;

      this.loggerService.log(`${url} - Short-lived token obtained`, {
        expiresIn: tokenRes.data.expires_in,
        hasToken: !!shortLivedToken,
      });

      if (!shortLivedToken) {
        return returnBadRequest({
          detail: 'Missing short-lived access token from Facebook',
          title: 'Invalid payload',
        });
      }

      // 2. Exchange short-lived token for long-lived token
      failureStage = 'long_lived_token';
      const longTokenRes: AxiosResponse<InstagramLongLivedTokenResponse> =
        await firstValueFrom(
          this.httpService.get(
            `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
            {
              params: {
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: shortLivedToken,
                grant_type: OAuthGrantType.FB_EXCHANGE_TOKEN,
              },
            },
          ),
        );

      const { access_token, expires_in } = longTokenRes.data || {};
      const scope = tokenRes.data.scope ?? longTokenRes.data?.scope;

      if (!access_token) {
        return returnBadRequest({
          detail: 'Failed to get long-lived access token',
          title: 'Invalid payload',
        });
      }

      // Update the credential with the access token
      // If reconnecting the same account, reactivate previously deleted credential
      failureStage = 'credential_persist';
      let credential = await this.credentialsService.patch(
        existingCredential.id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false, // Reactivate if previously disconnected
          oauthState: null,
          refreshToken: undefined,
          refreshTokenExpiry: undefined,
          ...buildGrantedScopesCredentialPatch(scope),
        },
      );

      try {
        await this.instagramAuthorizedSignalsService.refresh({
          accessToken: access_token,
          credentialId: credential.id.toString(),
          force: true,
          grantedScopes: scope,
          organizationId: existingCredential.organizationId,
        });
        credential =
          (await this.credentialsService.findOne({
            id: credential.id.toString(),
            organizationId: existingCredential.organizationId,
            platform: CredentialPlatform.INSTAGRAM,
          })) ?? credential;
      } catch (signalError: unknown) {
        this.loggerService.warn(
          `${url} authorized signal refresh failed after connection`,
          getSafeInstagramOAuthErrorLog(signalError),
        );
      }

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        stage: failureStage,
        ...getSafeInstagramOAuthErrorLog(error),
      });
      return throwMappedInstagramOAuthError(
        error,
        'Failed to verify Instagram OAuth',
      );
    }
  }

  @Post(':credentialId/authorized-signals/refresh')
  async refreshAuthorizedSignals(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    await this.instagramAuthorizedSignalsService.refresh({
      credentialId,
      organizationId: user.organizationId,
    });

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.INSTAGRAM,
    });

    if (!credential) {
      return returnNotFound('Instagram credential', credentialId);
    }

    return serializeSingle(request, CredentialSerializer, credential);
  }

  @Get('trends')
  getTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      return this.instagramService.getTrends();
    } catch (error) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to fetch Instagram trends');
    }
  }
}
