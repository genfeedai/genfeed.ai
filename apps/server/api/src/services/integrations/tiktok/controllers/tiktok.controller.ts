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
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import type { User } from '@clerk/backend';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
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
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

// In development, use ngrok for the front end
// and lt for the backend ssh tunnel

@AutoSwagger()
@Controller('services/tiktok')
export class TiktokController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly redirectUri: string;
  // private readonly redirectUri =
  //   'https://5292f8d66eed.ngrok-free.app/oauth/tiktok';
  private readonly scope = [
    'user.info.basic',
    'user.info.stats',
    'user.info.profile',
    'video.list',
    'video.upload',
    'video.publish',
  ];

  constructor(
    private readonly configService: ConfigService,

    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly tiktokService: TiktokService,
    private readonly httpService: HttpService,
  ) {
    this.redirectUri = `${this.configService.get('GENFEEDAI_APP_URL')}/oauth/tiktok`;
  }

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

    await this.credentialsService.saveCredentials(
      brand,
      CredentialPlatform.TIKTOK,
      {
        isConnected: false,
        oauthToken: undefined,
        oauthTokenSecret: undefined,
      },
    );

    const clientKey = this.configService.get('TIKTOK_CLIENT_KEY');

    const state = JSON.stringify({
      brandId: brand._id.toString(),
      organizationId: brand.organization.toString(),
    });

    const authUrl =
      `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent(this.scope.join(','))}` +
      `&state=${encodeURIComponent(state)}`;

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

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
        throw new HttpException(
          { detail: 'Missing code or identifiers', title: 'Invalid payload' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { organizationId, brandId } = JSON.parse(state);

      const data = new URLSearchParams({
        client_key: this.configService.get('TIKTOK_CLIENT_KEY'),
        client_secret: this.configService.get('TIKTOK_CLIENT_SECRET'),
        code,
        grant_type: OAuthGrantType.AUTHORIZATION_CODE,
        redirect_uri: this.redirectUri,
      } as Record<string, string>);

      const tokenRes = await firstValueFrom(
        this.httpService.post(
          'https://open.tiktokapis.com/v2/oauth/token/',
          data.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const {
        access_token,
        expires_in,
        refresh_token,
        refresh_token_expires_in,
      } = tokenRes.data || {};

      // Find and update the existing credential
      const existingCredential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.TIKTOK,
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

      // Update the credential with the access token
      // If reconnecting the same account, reactivate previously deleted credential
      let credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false, // Reactivate if previously disconnected
          refreshToken: refresh_token,
          refreshTokenExpiry: refresh_token_expires_in
            ? new Date(Date.now() + refresh_token_expires_in * 1000)
            : undefined,
        },
      );

      // Pass access_token directly to avoid race condition (no DB re-query)
      const { userId: externalId, username: externalHandle } =
        await this.tiktokService.getTiktokInfo(
          organizationId,
          brandId,
          access_token,
        );

      credential = await this.credentialsService.patch(
        credential._id.toString(),
        {
          externalHandle,
          externalId,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Get('trends')
  getTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      return this.tiktokService.getTrends();
    } catch (error) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail:
            error instanceof Error
              ? error.message
              : 'Failed to fetch TikTok trends',
          title: 'Failed to get trends',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
