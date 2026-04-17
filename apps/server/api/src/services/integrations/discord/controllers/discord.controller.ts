import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

@Controller('services/discord')
export class DiscordController {
  constructor(
    private readonly discordService: DiscordService,
    private readonly credentialsService: CredentialsService,
  ) {}

  /**
   * Generate OAuth URL and create pending credential
   *
   * POST /services/discord/connect
   */
  @Post('connect')
  async connect(
    @CurrentUser() user: Record<string, unknown>,
    @Body('organizationId') organizationId: string,
    @Body('brandId') brandId: string,
  ) {
    // Generate random state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);

    // Create or update pending credential with state
    const existingCredential = await this.credentialsService.findOne({
      brand: new Types.ObjectId(brandId),
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.DISCORD,
    });

    if (existingCredential) {
      await this.credentialsService.patch(existingCredential._id, {
        isConnected: false,
        isDeleted: false,
        oauthState: state,
      });
    } else {
      await this.credentialsService.create({
        brand: new Types.ObjectId(brandId),
        isConnected: false,
        // @ts-expect-error TS2353
        isDeleted: false,
        oauthState: state,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.DISCORD,
        user: new Types.ObjectId(user._id),
      });
    }

    // Generate Discord OAuth URL
    const authUrl = this.discordService.generateAuthUrl(state);

    return {
      state,
      url: authUrl,
    };
  }

  /**
   * Verify OAuth callback and save tokens
   *
   * POST /services/discord/verify
   */
  @Post('verify')
  async verify(
    @CurrentUser() _user: Record<string, unknown>,
    @Body('organizationId') organizationId: string,
    @Body('brandId') brandId: string,
    @Body('code') code: string,
    @Body('state') state: string,
  ) {
    // Find pending credential with matching state
    const credential = await this.credentialsService.findOne({
      brand: new Types.ObjectId(brandId),
      oauthState: state,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.DISCORD,
    });

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

    // Get user info
    const userInfo = await this.discordService.getUserInfo(
      tokenData.access_token,
    );

    // Update credential with tokens and user info
    const updatedCredential = await this.credentialsService.patch(
      credential._id,
      {
        accessToken: tokenData.access_token,
        accessTokenExpiry: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        externalAvatar: userInfo.avatar
          ? `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}.png`
          : undefined,
        externalHandle: userInfo.username,
        externalId: userInfo.id,
        externalName: userInfo.global_name || userInfo.username,
        isConnected: true,
        oauthState: null, // Clear state after successful verification
        refreshToken: tokenData.refresh_token,
      },
    );

    return updatedCredential;
  }

  /**
   * Disconnect Discord account
   *
   * POST /services/discord/disconnect
   */
  @Post('disconnect')
  disconnect(
    @CurrentUser() _user: Record<string, unknown>,
    @Body('organizationId') organizationId: string,
    @Body('brandId') brandId: string,
  ) {
    return this.discordService.disconnect(organizationId, brandId);
  }
}
