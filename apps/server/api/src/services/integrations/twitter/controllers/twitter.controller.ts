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
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
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
  Post,
  Req,
} from '@nestjs/common';
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
    private readonly twitterService: TwitterService,
  ) {}

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

    try {
      const client = new TwitterApi({
        clientId: this.configService.get('TWITTER_CLIENT_ID'),
        clientSecret: this.configService.get('TWITTER_CLIENT_SECRET'),
      } as TwitterApiOAuth2Init);

      const state = JSON.stringify({
        brandId: brand._id,
        organizationId: brand.organization,
        userId: publicMetadata.user,
      });

      const redirectUri = this.configService.get(
        'TWITTER_REDIRECT_URI',
      ) as string;

      const { url: authUrl, codeVerifier } = client.generateOAuth2AuthLink(
        redirectUri,
        {
          scope: [
            'tweet.read',
            'tweet.write',
            'users.read',
            'media.write',
            'dm.read',
            'dm.write',
            'offline.access',
          ],
          state,
        },
      );

      // Store PKCE codeVerifier (encrypted via schema setter)
      await this.credentialsService.saveCredentials(
        brand,
        CredentialPlatform.TWITTER,
        {
          isConnected: false,
          oauthTokenSecret: codeVerifier,
        },
      );

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
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

      const { brandId, organizationId } = JSON.parse(state);

      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.TWITTER,
      });

      if (!credential) {
        throw new HttpException(
          { detail: 'Twitter credential not found', title: 'OAuth Error' },
          HttpStatus.BAD_REQUEST,
        );
      }

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

      const client = new TwitterApi({
        clientId: this.configService.get('TWITTER_CLIENT_ID'),
        clientSecret: this.configService.get('TWITTER_CLIENT_SECRET'),
      } as TwitterApiOAuth2Init);

      const redirectUri = this.configService.get(
        'TWITTER_REDIRECT_URI',
      ) as string;

      const {
        client: loggedClient,
        accessToken,
        refreshToken,
        expiresIn,
      } = await client.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri,
      });

      // Get authenticated user profile
      const { data: me } = await loggedClient.v2.me();

      // Update credential with OAuth 2.0 tokens
      const updatedCredential = await this.credentialsService.patch(
        credential._id,
        {
          accessToken,
          accessTokenExpiry: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined,
          externalHandle: me.username,
          externalId: me.id,
          isConnected: true,
          isDeleted: false,
          oauthToken: undefined,
          oauthTokenSecret: undefined,
          refreshToken,
        },
      );

      return serializeSingle(request, CredentialSerializer, updatedCredential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
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
}
