import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
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
  HttpException,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

interface ThreadsShortLivedTokenResponse {
  access_token: string;
  user_id?: string;
}

interface ThreadsLongLivedTokenResponse {
  access_token: string;
  expires_in?: number;
}

@AutoSwagger()
@Controller('services/threads')
export class ThreadsController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly graphUrl: string = 'https://graph.threads.net';
  private readonly apiVersion: string;

  // Threads OAuth scopes
  private readonly scope = [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_insights',
    'threads_manage_replies',
    'threads_read_replies',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly threadsService: ThreadsService,
    private readonly loggerService: LoggerService,
  ) {
    this.apiVersion = this.configService.get('THREADS_API_VERSION') || 'v1.0';
  }

  /**
   * Report whether the backend configuration guard will allow Threads OAuth.
   */
  @Get('connect-readiness')
  getConnectReadiness(): { status: 'available' | 'unavailable' } {
    try {
      this.getOAuthConfig();
      return { status: 'available' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return { status: 'unavailable' };
      }
      throw error;
    }
  }

  /**
   * Step 1: Get Threads OAuth URL for user to connect their account.
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

    const { clientId, redirectUri } = this.getOAuthConfig();

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.THREADS,
      {
        accessToken: undefined,
        isConnected: false,
        oauthToken: undefined,
        oauthTokenSecret: undefined,
      },
    );

    this.loggerService.log(`${url} - Generating OAuth URL`);

    // Threads OAuth endpoint
    const authUrl =
      `https://threads.net/oauth/authorize?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(this.scope.join(','))}` +
      `&response_type=code&state=${encodeURIComponent(state)}`;

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  /**
   * Step 2: Handle the OAuth callback, exchange code for access token
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

      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.THREADS,
        );

      if (!existingCredential) {
        return returnNotFound('Pending OAuth credential', state);
      }

      const { organizationId } = existingCredential;

      const { clientId, clientSecret, redirectUri } = this.getOAuthConfig();

      // Exchange code for short-lived token
      let tokenRes: AxiosResponse<ThreadsShortLivedTokenResponse>;
      try {
        tokenRes = await firstValueFrom(
          this.httpService.post(
            `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
            null,
            {
              params: {
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: OAuthGrantType.AUTHORIZATION_CODE,
                redirect_uri: redirectUri,
              },
            },
          ),
        );
      } catch (error: unknown) {
        const response = (
          error as {
            response?: { data?: Record<string, unknown>; status?: number };
          }
        )?.response;
        const errorData = response?.data?.error || response?.data;

        this.loggerService.error(`${url} - Failed to exchange code for token`, {
          error: errorData,
          httpCode: response?.status,
        });

        return returnBadRequest({
          detail:
            // @ts-expect-error TS2339
            errorData?.message ||
            'Invalid or expired authorization code. Please try connecting again.',
          title: 'Authentication failed',
        });
      }

      const shortLivedToken = tokenRes.data.access_token;
      const userId = tokenRes.data.user_id;

      if (!shortLivedToken) {
        return returnBadRequest({
          detail: 'Missing access token from Threads',
          title: 'Invalid payload',
        });
      }

      // Exchange short-lived token for long-lived token
      let longTokenRes: AxiosResponse<ThreadsLongLivedTokenResponse>;
      try {
        longTokenRes = await firstValueFrom(
          this.httpService.get(`${this.graphUrl}/access_token`, {
            params: {
              access_token: shortLivedToken,
              client_secret: clientSecret,
              grant_type: OAuthGrantType.TH_EXCHANGE_TOKEN,
            },
          }),
        );
      } catch (error: unknown) {
        this.loggerService.error(
          `${url} - Failed to exchange for long-lived token`,
          {
            error:
              (error as { response?: { data?: unknown } })?.response?.data ||
              (error as Error)?.message,
          },
        );
        throw error;
      }

      const { access_token, expires_in } = longTokenRes.data || {};

      if (!access_token) {
        return returnBadRequest({
          detail: 'Failed to get long-lived access token',
          title: 'Invalid payload',
        });
      }

      // Get account details to store username
      const externalProfile = await this.resolveExternalProfile(
        access_token,
        userId,
      );

      // Update the credential with the access token
      let credential = await this.credentialsService.patch(
        existingCredential.id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          oauthState: null,
        },
      );

      credential = await this.credentialsService.updateExternalProfile(
        credential.id,
        organizationId,
        externalProfile,
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      return returnInternalServerError('Failed to verify Threads OAuth');
    }
  }

  private async resolveExternalProfile(
    accessToken: string,
    oauthUserId: string | undefined,
  ): Promise<{
    avatarUrl?: string;
    handle?: string;
    id?: string;
    name?: string;
  }> {
    const accountDetails = (await this.threadsService.getAccountDetails(
      accessToken,
    )) as {
      id?: string;
      threads_profile_picture_url?: string;
      username?: string;
    };
    return {
      avatarUrl: accountDetails.threads_profile_picture_url,
      handle: accountDetails.username,
      id: oauthUserId || accountDetails.id,
      name: accountDetails.username,
    };
  }

  @Get('trends')
  getTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      return this.threadsService.getTrends();
    } catch (error) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to fetch Threads trends');
    }
  }

  private getOAuthConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.configService.get('THREADS_CLIENT_ID')?.trim();
    const clientSecret = this.configService
      .get('THREADS_CLIENT_SECRET')
      ?.trim();
    const redirectUri = this.configService.get('THREADS_REDIRECT_URI')?.trim();

    if (
      !clientId ||
      isUnconfiguredSecret(clientId) ||
      !clientSecret ||
      isUnconfiguredSecret(clientSecret) ||
      !redirectUri ||
      isUnconfiguredSecret(redirectUri)
    ) {
      throw new ServiceUnavailableException(
        'Threads OAuth is not configured for this deployment.',
      );
    }

    return { clientId, clientSecret, redirectUri };
  }
}
