import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { claimOAuthVerifyCredential } from '@api/collections/credentials/utils/oauth-verify-claim.util';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { ApiKeyScope, CredentialPlatform } from '@genfeedai/contracts';
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
  @RequiredScopes(ApiKeyScope.ADMIN)
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
  @RequiredScopes(ApiKeyScope.ADMIN)
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
    const claim = await claimOAuthVerifyCredential(
      this.credentialsService,
      state,
      CredentialPlatform.DISCORD,
      { organizationId: organization, userId },
    );
    if (claim?.alreadyConnected) {
      return serializeSingle(request, CredentialSerializer, claim.credential);
    }
    const credential = claim?.credential;

    if (!credential) {
      throw new HttpException(
        {
          detail: 'OAuth state mismatch or credential not found',
          title: 'Invalid State',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

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

    const { webhook } = tokenData;
    if (!webhook?.id || !webhook.token || !webhook.channel_id) {
      throw new HttpException(
        {
          detail:
            'Discord did not return a channel webhook. Connect again and choose a channel.',
          title: 'No channel selected',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const guildName = await this.discordService.getGuildName(
      tokenData.access_token,
      webhook.guild_id,
    );

    // One credential per channel: the channel is the identity, so connecting
    // another channel adds an account and reconnecting a channel refreshes it.
    // The secret is the webhook's `<id>/<token>` path, which is all that
    // posting needs; the user's own OAuth tokens are not kept.
    const updatedCredential = await this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId,
      {
        handle: webhook.channel_id,
        id: `${webhook.guild_id}:${webhook.channel_id}`,
        name: `${guildName ?? `Server ${webhook.guild_id}`} · channel ${webhook.channel_id}`,
      },
      { accessToken: `${webhook.id}/${webhook.token}` },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }
}
