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
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
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
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/youtube')
export class YoutubeController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
    private readonly youtubeService: YoutubeService,
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

    try {
      const credential = await this.credentialsService.findOne({
        brand: brand._id,
        organization: brand.organization,
        platform: CredentialPlatform.YOUTUBE,
      });

      if (!credential) {
        await this.credentialsService.saveCredentials(
          brand,
          CredentialPlatform.YOUTUBE,
          {
            isConnected: false,
          },
        );
      }

      const authUrl = this.youtubeService.generateAuthUrl({
        accessType: 'offline',
        includeGrantedScopes: false,
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/youtube',
          'https://www.googleapis.com/auth/youtube.readonly',
          'https://www.googleapis.com/auth/youtube.force-ssl',
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/yt-analytics.readonly',
        ],
        state: JSON.stringify({
          brandId: brand._id,
          organizationId: brand.organization,
          userId: publicMetadata.user,
        }),
      });

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
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
          { detail: 'Missing code or identifiers', title: 'Invalid payload' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { brandId, organizationId } = JSON.parse(state);
      const { tokens } = await this.youtubeService.exchangeCodeForTokens(code);

      // Find and update the existing credential
      const existingCredential = await this.credentialsService.findOne({
        brand: brandId,
        organization: organizationId,
        platform: CredentialPlatform.YOUTUBE,
      });

      if (!existingCredential) {
        throw new HttpException(
          {
            detail: 'No pending credential found for this brand',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Log token details for debugging
      this.loggerService.log('Received tokens from Google', {
        accessTokenLength: tokens.access_token?.length || 0,
        expiryDate: tokens.expiry_date,
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        refreshTokenLength: tokens.refresh_token?.length || 0,
        scope: tokens.scope,
        tokenType: tokens.token_type,
      });

      // Update the credential with the access token
      // If reconnecting the same channel, reactivate previously deleted credential
      let credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken: tokens.access_token,
          isConnected: true,
          isDeleted: false, // Reactivate if previously disconnected
          oauthToken: undefined,
          oauthTokenSecret: undefined,
          refreshToken: tokens.refresh_token || undefined, // Only save if present
          refreshTokenExpiry: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : undefined,
        },
      );

      // Verify the credential was saved correctly
      const savedCredential = await this.credentialsService.findOne({
        _id: credential._id,
      });

      if (!savedCredential?.refreshToken) {
        this.loggerService.error('Refresh token was not saved properly', {
          credentialId: credential._id,
          hadRefreshToken: !!tokens.refresh_token,
        });
        throw new HttpException(
          {
            detail: 'Refresh token was not saved. Please try connecting again.',
            title: 'Failed to save credentials',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Now verify the connection by getting channel details
      // Create a per-request OAuth client with the fresh tokens
      try {
        // Create a new OAuth2 client instance per request to avoid race conditions
        // DO NOT use the shared youtubeOAuthAPI - it would cause credential mixing
        const oauth2Client = YoutubeOAuth2Util.createClient(
          this.configService.get('YOUTUBE_CLIENT_ID')!,
          // @ts-expect-error TS2345
          this.configService.get<string>('YOUTUBE_CLIENT_SECRET'),
          this.configService.get<string>('YOUTUBE_REDIRECT_URI'),
        );

        oauth2Client.setCredentials({
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type,
        });

        // Pass the per-request auth client to avoid race conditions
        const { id: externalId, title: externalHandle } =
          await this.youtubeService.getChannelDetails(
            organizationId,
            brandId,
            oauth2Client, // Pass per-request client
          );

        credential = await this.credentialsService.patch(credential._id, {
          externalHandle,
          externalId,
        });
      } catch (verifyError: unknown) {
        this.loggerService.error(
          'Failed to verify YouTube connection',
          verifyError,
        );
        // Don't fail the entire verify - credentials are saved, just mark as unverified
        // The user can verify later or we'll retry on next use
      }

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      const response = (error as { response?: { data?: unknown } })?.response;
      this.loggerService.error(`${url} failed`, response?.data || error);

      throw error;
    }
  }

  @Get('trends')
  async getTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const trends = await this.youtubeService.getTrends();
      return trends;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail:
            error instanceof Error
              ? error.message
              : 'Failed to fetch YouTube trends',
          title: 'Failed to get trends',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('metadata/:videoId')
  async getVideoMetadata(@Param('videoId') videoId: string) {
    const metadata = await this.youtubeService.getVideoMetadata(videoId);

    return {
      data: metadata,
      success: Boolean(metadata),
    };
  }
}
