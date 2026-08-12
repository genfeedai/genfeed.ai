import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RestreamService } from '@api/services/integrations/restream/services/restream.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('services/restream')
export class RestreamController {
  constructor(
    private readonly restreamService: RestreamService,
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
  ) {}

  /**
   * POST /services/restream/connect
   * Start Restream OAuth and create a pending credential.
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body('brandId') brandId: string,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: organization,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.restreamService.isConfigured()) {
      throw new HttpException(
        {
          detail:
            'Restream is not configured on this deployment. Set RESTREAM_CLIENT_ID, RESTREAM_CLIENT_SECRET, and RESTREAM_REDIRECT_URI.',
          title: 'Configuration Error',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      userId,
      CredentialPlatform.RESTREAM,
      { isConnected: false },
    );

    const authUrl = this.restreamService.generateAuthUrl(state);

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  /**
   * POST /services/restream/verify
   * Exchange code and store tokens on the pending credential.
   */
  @Post('verify')
  async verify(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body('code') code: string,
    @Body('state') state: string,
  ) {
    if (!code || !state) {
      throw new HttpException(
        {
          detail: 'Missing required OAuth parameters',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { organization, user: userId } = getPublicMetadata(user);
    const credential = await this.credentialsService.findPendingOAuthCredential(
      state,
      CredentialPlatform.RESTREAM,
      { organizationId: organization, userId },
    );

    if (!credential) {
      throw new HttpException(
        {
          detail: 'OAuth state mismatch or credential not found',
          title: 'Invalid State',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tokenData = await this.restreamService.exchangeCodeForToken(code);
    if (!tokenData?.access_token) {
      throw new HttpException(
        {
          detail: 'Restream did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const profile = await this.restreamService.getProfile(
      tokenData.access_token,
    );

    const updatedCredential = await this.credentialsService.patch(
      credential.id,
      {
        accessToken: tokenData.access_token,
        accessTokenExpiry: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        externalHandle: profile.username,
        externalId: profile.id,
        externalName: profile.username || 'Restream',
        isConnected: true,
        oauthState: null,
        refreshToken: tokenData.refresh_token,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }
}
