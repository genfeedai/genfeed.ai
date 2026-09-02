import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { TwitterAuthorizedSignalsService } from '@api/services/integrations/twitter/services/twitter-authorized-signals.service';
import { isUnconfiguredSecret } from '@genfeedai/config';
import {
  CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
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
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { isTwitterOAuthCodeError } from '@server/services/integrations/twitter/utils/twitter-api-error.util';
import type { Request } from 'express';
import { TwitterApi, type TwitterApiOAuth2Init } from 'twitter-api-v2';

@AutoSwagger()
@Controller('services/twitter')
export class TwitterController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly twitterAuthorizedSignalsService: TwitterAuthorizedSignalsService,
    private readonly twitterService: TwitterService,
  ) {}

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
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const oauth = this.getOAuthConfig();

    try {
      const { credential, state } =
        await this.credentialsService.beginOAuthForBrand(
          brand,
          user.userId ?? user.id,
          CredentialPlatform.TWITTER,
          { isConnected: false },
        );

      const client = new TwitterApi({
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
      } as TwitterApiOAuth2Init);

      const { url: authUrl, codeVerifier } = client.generateOAuth2AuthLink(
        oauth.redirectUri,
        {
          scope: [
            'tweet.read',
            'tweet.write',
            'users.read',
            'media.write',
            'offline.access',
          ],
          state,
        },
      );

      await this.credentialsService.patch(credential.id, {
        oauthTokenSecret: codeVerifier,
      });

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: 'Failed to initiate Twitter OAuth',
          title: 'Connection Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() createCredentialVerifyDto: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialVerifyDto);

    const { code, state } = createCredentialVerifyDto;

    try {
      if (!code || !state) {
        throw new HttpException(
          {
            detail: 'Missing required OAuth parameters',
            title: 'Invalid payload',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const credential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.TWITTER,
        );

      if (!credential) {
        throw new HttpException(
          { detail: 'Twitter credential not found', title: 'OAuth Error' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { organizationId } = credential;

      // Retrieve stored PKCE code verifier (encrypted via schema setter)
      const codeVerifier = credential.oauthTokenSecret
        ? EncryptionUtil.decrypt(credential.oauthTokenSecret)
        : null;

      if (!codeVerifier) {
        throw new HttpException(
          { detail: 'Missing PKCE code verifier', title: 'OAuth Error' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const oauth = this.getOAuthConfig();
      const client = new TwitterApi({
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
      } as TwitterApiOAuth2Init);

      const {
        client: loggedClient,
        accessToken,
        refreshToken,
        expiresIn,
        scope,
      } = await client.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri: oauth.redirectUri,
      });

      // Get authenticated user profile
      const { data: me } = await loggedClient.v2.me({
        'user.fields': ['profile_image_url'],
      });

      // Update credential with OAuth 2.0 tokens
      let updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          accessToken,
          accessTokenExpiry: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          oauthState: null,
          oauthToken: null,
          oauthTokenSecret: null,
          refreshToken,
          ...buildGrantedScopesCredentialPatch(scope),
        },
      );

      updatedCredential = await this.credentialsService.updateExternalProfile(
        updatedCredential.id,
        organizationId,
        {
          avatarUrl: me.profile_image_url,
          handle: me.username,
          id: me.id,
          name: me.name,
        },
      );

      try {
        await this.twitterAuthorizedSignalsService.refresh({
          accessToken,
          credentialId: updatedCredential.id.toString(),
          force: true,
          grantedScopes: scope,
          organizationId,
        });
        updatedCredential =
          (await this.credentialsService.findOne({
            id: updatedCredential.id.toString(),
            organizationId,
            platform: toPrismaCredentialPlatform(CredentialPlatform.TWITTER),
          })) ?? updatedCredential;
      } catch (signalError: unknown) {
        this.loggerService.warn(
          `${url} authorized signal refresh failed after connection`,
          signalError,
        );
      }

      return serializeSingle(request, CredentialSerializer, updatedCredential);
    } catch (error: unknown) {
      if (isTwitterOAuthCodeError(error)) {
        this.loggerService.warn(
          `${url} rejected an expired, reused, or mismatched OAuth code`,
        );
        throw new HttpException(
          {
            detail:
              'X authorization expired or was already used. Connect X again.',
            title: 'OAuth Error',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (error instanceof HttpException && error.getStatus() < 500) {
        this.loggerService.warn(`${url} rejected an invalid OAuth callback`);
        throw error;
      }
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Post(':credentialId/authorized-signals/refresh')
  async refreshAuthorizedSignals(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    await this.twitterAuthorizedSignalsService.refresh({
      credentialId,
      organizationId: user.organizationId,
    });

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: toPrismaCredentialPlatform(CredentialPlatform.TWITTER),
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'X credential not found',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, CredentialSerializer, credential);
  }

  @Get('trends')
  async getTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const trends = await this.twitterService.getTrends();
      return trends;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail:
            error instanceof Error
              ? error.message
              : 'Failed to fetch Twitter trends',
          title: 'Failed to get trends',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getOAuthConfig() {
    const clientId = this.configService.get('TWITTER_CLIENT_ID');
    const clientSecret = this.configService.get('TWITTER_CLIENT_SECRET');
    const redirectUri = this.configService.get('TWITTER_REDIRECT_URI');

    if (
      !clientId ||
      !clientSecret ||
      !redirectUri ||
      isUnconfiguredSecret(clientId) ||
      isUnconfiguredSecret(clientSecret) ||
      isUnconfiguredSecret(redirectUri)
    ) {
      throw new ServiceUnavailableException(
        'X (Twitter) OAuth is not configured for this deployment.',
      );
    }

    return { clientId, clientSecret, redirectUri };
  }
}
