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
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
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
@Controller('services/threads')
export class ThreadsController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly redirectUri: string;

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
    this.redirectUri = this.configService.get('THREADS_REDIRECT_URI') ?? '';
    this.apiVersion = this.configService.get('THREADS_API_VERSION') || 'v1.0';
  }

  /**
   * Step 1: Get Threads OAuth URL for user to connect their account.
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
      CredentialPlatform.THREADS,
      {
        accessToken: undefined,
        isConnected: false,
        oauthToken: undefined,
        oauthTokenSecret: undefined,
      },
    );

    const appId = this.configService.get('THREADS_CLIENT_ID');
    const state = JSON.stringify({
      brandId: brand._id,
      organizationId: brand.organization,
      userId: publicMetadata.user,
    });

    this.loggerService.log(`${url} - Generating OAuth URL`, {
      appId: appId ? 'configured' : 'missing',
      redirectUri: this.redirectUri,
    });

    // Threads OAuth endpoint
    const authUrl =
      `https://threads.net/oauth/authorize?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
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

      const { brandId, organizationId } = JSON.parse(state);

      const appId = this.configService.get('THREADS_CLIENT_ID');
      const appSecret = this.configService.get('THREADS_CLIENT_SECRET');

      if (!appId || !appSecret) {
        this.loggerService.error(`${url} - Missing app credentials`);
        return returnBadRequest({
          detail: 'Threads app credentials are not configured',
          title: 'Configuration error',
        });
      }

      // Exchange code for short-lived token
      let tokenRes;
      try {
        tokenRes = await firstValueFrom(
          this.httpService.post(
            `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
            null,
            {
              params: {
                client_id: appId,
                client_secret: appSecret,
                code,
                grant_type: OAuthGrantType.AUTHORIZATION_CODE,
                redirect_uri: this.redirectUri,
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
      let longTokenRes;
      try {
        longTokenRes = await firstValueFrom(
          this.httpService.get(`${this.graphUrl}/access_token`, {
            params: {
              access_token: shortLivedToken,
              client_secret: appSecret,
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
      const accountDetails = (await this.threadsService.getAccountDetails(
        access_token,
      )) as {
        id?: string;
        username?: string;
      };

      // Find and update the existing credential
      const existingCredential = await this.credentialsService.findOne({
        brand: brandId,
        organization: organizationId,
        platform: CredentialPlatform.THREADS,
      });

      if (!existingCredential) {
        return returnNotFound('Credential', brandId);
      }

      // Update the credential with the access token
      const credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          externalHandle: accountDetails?.username,
          externalId: userId || accountDetails?.id,
          isConnected: true,
          isDeleted: false,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to verify Threads OAuth');
    }
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
}
