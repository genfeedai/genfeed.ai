import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { CredentialPlatform } from '@genfeedai/contracts';
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

@Controller('services/discord')
export class DiscordController {
  constructor(
    private readonly discordService: DiscordService,
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
  ) {}

  /**
   * Generate OAuth URL and create pending credential
   *
   * POST /services/discord/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body('brandId') brandId: string,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
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

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      userId,
      CredentialPlatform.DISCORD,
      { isConnected: false },
    );

    // Generate Discord OAuth URL
    const authUrl = this.discordService.generateAuthUrl(state);

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  /**
   * Verify OAuth callback and save tokens
   *
   * POST /services/discord/verify
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

    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const credential = await this.credentialsService.findPendingOAuthCredential(
      state,
      CredentialPlatform.DISCORD,
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

    // Exchange code for tokens
    const tokenData = await this.discordService.exchangeCodeForToken(code);

    if (!tokenData?.access_token) {
      throw new HttpException(
        {
          detail: 'Discord did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Get user info
    const userInfo = await this.discordService.getUserInfo(
      tokenData.access_token,
    );

    // Tokens and identity in one call: identity decides whether this is a
    // reconnect of an account the brand already has or an additional one.
    const updatedCredential = await this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId,
      {
        avatarUrl: userInfo.avatar
          ? `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png`
          : undefined,
        handle: userInfo.username,
        id: userInfo.id,
        name: userInfo.global_name || userInfo.username,
      },
      {
        accessToken: tokenData.access_token,
        accessTokenExpiry: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        refreshToken: tokenData.refresh_token,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }
}
