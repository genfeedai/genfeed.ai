import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TiktokAuthorizedSignalsService } from '@api/services/integrations/tiktok/services/tiktok-authorized-signals.service';
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
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

@AutoSwagger()
@Controller('services/tiktok')
export class TiktokController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly redirectUri: string;
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
    private readonly tiktokAuthorizedSignalsService: TiktokAuthorizedSignalsService,
    private readonly tiktokService: TiktokService,
    private readonly httpService: HttpService,
  ) {
    this.redirectUri = `${this.configService.get('GENFEEDAI_APP_URL')}/oauth/tiktok`;
  }

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

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.TIKTOK,
      {
        isConnected: false,
        oauthToken: undefined,
        oauthTokenSecret: undefined,
      },
    );

    const clientKey = this.configService.get('TIKTOK_CLIENT_KEY');

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

      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.TIKTOK,
        );

      if (!existingCredential) {
        throw new HttpException(
          {
            detail: 'No pending credential found for this OAuth state',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const { brandId, organizationId } = existingCredential;

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
        refresh_expires_in,
        refresh_token,
        refresh_token_expires_in,
        scope,
      } = tokenRes.data || {};
      const refreshExpiresIn = refresh_expires_in ?? refresh_token_expires_in;

      if (!access_token) {
        throw new HttpException(
          {
            detail: 'TikTok did not return an access token',
            title: 'Token exchange failed',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      // Update the credential with the access token
      // If reconnecting the same account, reactivate previously deleted credential
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
          refreshToken: refresh_token,
          refreshTokenExpiry: refreshExpiresIn
            ? new Date(Date.now() + refreshExpiresIn * 1000)
            : undefined,
          ...buildGrantedScopesCredentialPatch(scope),
        },
      );

      // Pass access_token directly to avoid race condition (no DB re-query)
      const profile = await this.tiktokService.getTiktokInfo(
        organizationId,
        brandId,
        access_token,
        scope,
      );

      credential = await this.credentialsService.updateExternalProfile(
        credential.id.toString(),
        organizationId,
        {
          avatarUrl: profile.avatarUrl,
          handle: profile.username,
          id: profile.userId,
          name: profile.displayName,
        },
      );

      try {
        await this.tiktokAuthorizedSignalsService.refresh({
          accessToken: access_token,
          credentialId: credential.id.toString(),
          force: true,
          grantedScopes: scope,
          organizationId,
        });
        credential =
          (await this.credentialsService.findOne({
            id: credential.id.toString(),
            organizationId,
            platform: CredentialPlatform.TIKTOK,
          })) ?? credential;
      } catch (signalError: unknown) {
        this.loggerService.warn(
          `${url} authorized signal refresh failed after connection`,
          signalError,
        );
      }

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error) {
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
    await this.tiktokAuthorizedSignalsService.refresh({
      credentialId,
      organizationId: user.organizationId,
    });

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.TIKTOK,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'TikTok credential not found',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, CredentialSerializer, credential);
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
