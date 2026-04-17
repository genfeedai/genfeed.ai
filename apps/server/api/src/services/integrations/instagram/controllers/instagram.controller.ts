import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  CreateCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

@AutoSwagger()
@Controller('services/instagram')
export class InstagramController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly redirectUri: string;

  // private readonly redirectUri =
  //   'https://5292f8d66eed.ngrok-free.app/oauth/instagram';

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
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialDto);

    const publicMetadata = getPublicMetadata(user);

    const brand = await this.brandsService.findOne({
      _id: createCredentialDto.brand,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    // Save a placeholder credential so we can update it after verification
    await this.credentialsService.saveCredentials(
      brand,
      CredentialPlatform.INSTAGRAM,
      {
        accessToken: undefined,
        isConnected: false,
        oauthToken: undefined,
        oauthTokenSecret: undefined,
      },
    );

    const appId = this.configService.get('INSTAGRAM_APP_ID');
    const state = JSON.stringify({
      brandId: brand._id,
      organizationId: brand.organization,
      userId: publicMetadata.user,
    });

    this.loggerService.log(`${url} - Generating OAuth URL`, {
      appId: appId ? 'configured' : 'missing',
      redirectUri: this.redirectUri,
    });

    // Facebook/Instagram OAuth endpoint
    const authUrl =
      `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
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
    this.loggerService.log(url, createCredentialVerifyDto);
    try {
      const { code, state } = createCredentialVerifyDto;

      if (!code || !state) {
        return returnBadRequest({
          detail: 'Missing code or identifiers',
          title: 'Invalid payload',
        });
      }

      const { brandId, organizationId } = JSON.parse(state);

      // 1. Exchange code for short-lived user access token
      const appId = this.configService.get('INSTAGRAM_APP_ID');
      const appSecret = this.configService.get('INSTAGRAM_APP_SECRET');

      if (!appId || !appSecret) {
        this.loggerService.error(`${url} - Missing app credentials`);
        return returnBadRequest({
          detail: 'Instagram app credentials are not configured',
          title: 'Configuration error',
        });
      }

      // Authorization codes expire quickly (10-60 seconds) and can only be used once
      // The redirect_uri must match EXACTLY (including protocol, domain, path, trailing slashes)
      let tokenRes;
      try {
        // Use POST method as per OAuth 2.0 specification and Facebook's recommendation
        tokenRes = await firstValueFrom(
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
      } catch (error: unknown) {
        // Extract error details - Facebook/Instagram errors can be nested multiple levels
        // Structure can be: error.response.data.error.error.error
        const response = (
          error as {
            response?: { data?: Record<string, unknown>; status?: number };
          }
        )?.response;
        let errorData = response?.data;
        if (errorData?.error) {
          // @ts-expect-error TS2322
          errorData = errorData.error;
          // Handle double nesting
          if (errorData?.error) {
            // @ts-expect-error TS2322
            errorData = errorData.error;
          }
        }

        const errorCode = errorData?.code;
        const errorMessage = errorData?.message;
        const errorType = errorData?.type;
        const errorSubcode = errorData?.error_subcode;

        this.loggerService.error(`${url} - Failed to exchange code for token`, {
          error: errorData,
          errorCode,
          errorSubcode,
          errorType,
          hasCode: !!code,
          httpCode: response?.status,
          redirectUri: this.redirectUri,
        });

        // Handle specific Facebook Graph API errors
        if (errorCode === 190) {
          // Code 190 can mean different things:
          // - Invalid or expired authorization code
          // - Redirect URI mismatch
          // - Code already used
          return returnBadRequest({
            detail:
              errorMessage ||
              'Invalid or expired authorization code. The code may have expired, been used already, or the redirect URI does not match. Please try connecting again.',
            title: 'Authentication failed',
          });
        }

        if (errorCode === 102) {
          return returnBadRequest({
            detail:
              errorMessage ||
              'Session expired or invalid. Please reconnect your Instagram account.',
            title: 'Authentication failed',
          });
        }

        // Handle redirect URI mismatch (common cause)
        if (
          errorCode === 100 ||
          // @ts-expect-error TS2339
          errorMessage?.toLowerCase().includes('redirect_uri')
        ) {
          return returnBadRequest({
            detail:
              errorMessage ||
              'Redirect URI mismatch. The redirect URI used in the authorization request must exactly match the one used in the token exchange.',
            title: 'Configuration error',
          });
        }

        throw error;
      }

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
      let longTokenRes;
      try {
        longTokenRes = await firstValueFrom(
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
      } catch (error: unknown) {
        this.loggerService.error(
          `${url} - Failed to exchange token for long-lived token`,
          {
            code: (
              error as {
                response?: { data?: Record<string, unknown>; status?: number };
              }
            )?.response?.status,
            error:
              (
                error as {
                  response?: {
                    data?: Record<string, unknown>;
                    status?: number;
                  };
                }
              )?.response?.data || (error as Error)?.message,
          },
        );

        // Handle specific Facebook Graph API errors
        const errorCode = (
          error as {
            response?: { data?: Record<string, unknown>; status?: number };
          }
        )?.response?.data?.error?.code;
        // @ts-expect-error TS2339
        const errorMessage = (
          error as {
            response?: { data?: Record<string, unknown>; status?: number };
          }
        )?.response
          // @ts-expect-error TS2349
          ?.data?.(error as Error)?.message;

        if (errorCode === 190 || errorCode === 102) {
          return returnBadRequest({
            detail:
              errorMessage ||
              'Invalid OAuth access token. The authorization may have expired. Please reconnect your Instagram account.',
            title: 'Authentication failed',
          });
        }

        throw error;
      }

      const { access_token, expires_in } = longTokenRes.data || {};

      if (!access_token) {
        return returnBadRequest({
          detail: 'Failed to get long-lived access token',
          title: 'Invalid payload',
        });
      }

      // 3. Find and update the existing credential
      const existingCredential = await this.credentialsService.findOne({
        brand: brandId,
        organization: organizationId,
        platform: CredentialPlatform.INSTAGRAM,
      });

      if (!existingCredential) {
        return returnNotFound('Credential', brandId);
      }

      // Update the credential with the access token
      // If reconnecting the same account, reactivate previously deleted credential
      const credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false, // Reactivate if previously disconnected
          refreshToken: undefined,
          refreshTokenExpiry: undefined,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      // Handle expired/invalid token errors from Facebook Graph API
      // Error code 190: Access token expired
      // Error code 102: Session key invalid or no longer valid
      const response =
        (
          error as {
            response?: { data?: Record<string, unknown>; status?: number };
          }
        )?.response ||
        (error as { error?: { response?: { data?: Record<string, unknown> } } })
          ?.error?.response;
      const errorData = response?.data as Record<string, unknown> | undefined;
      const nestedError = errorData?.error as
        | Record<string, unknown>
        | undefined;
      const errorCode =
        nestedError?.code ||
        errorData?.error_code ||
        (
          error as {
            error?: { response?: { data?: { error?: { code?: number } } } };
          }
        )?.error?.response?.data?.error?.code;

      if (errorCode === 190 || errorCode === 102) {
        return returnBadRequest({
          detail:
            'Your Instagram connection has expired. Please reconnect your Instagram account.',
          title: 'Authentication failed',
        });
      }

      return returnInternalServerError('Failed to verify Instagram OAuth');
    }
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
