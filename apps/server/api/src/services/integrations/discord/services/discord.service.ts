import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/** The webhook Discord creates for the channel the user picked. */
interface DiscordIncomingWebhook {
  channel_id: string;
  guild_id: string;
  id: string;
  name?: string | null;
  token: string;
}

export interface DiscordTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  webhook?: DiscordIncomingWebhook;
}

@Traced()
@Injectable()
export class DiscordService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly clientId: string | undefined;

  private readonly clientSecret: string | undefined;

  private readonly redirectUri: string | undefined;

  private readonly authUrl = 'https://discord.com/api/oauth2/authorize';
  private readonly tokenUrl = 'https://discord.com/api/oauth2/token';
  private readonly userGuildsUrl = 'https://discord.com/api/users/@me/guilds';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {
    this.clientId = this.configService.get('DISCORD_CLIENT_ID');
    this.clientSecret = this.configService.get('DISCORD_CLIENT_SECRET');
    this.redirectUri = this.configService.get('DISCORD_REDIRECT_URI');
  }

  private getErrorDetail(error: unknown, fallback: string): string {
    if (isRecord(error) && isRecord(error.response)) {
      const responseData = error.response.data;
      if (isRecord(responseData)) {
        if (typeof responseData.error_description === 'string') {
          return responseData.error_description;
        }

        if (typeof responseData.message === 'string') {
          return responseData.message;
        }
      }
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }

  /**
   * Generate Discord OAuth2 authorization URL
   *
   * @param state - CSRF state token
   * @returns Authorization URL
   */
  generateAuthUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Discord OAuth configuration is missing. Please set DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      // `webhook.incoming` makes Discord ask the user to pick a channel and
      // returns a webhook for it, so posting needs no bot in the server.
      scope: 'identify guilds webhook.incoming',
      state,
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   *
   * @param code - Authorization code from Discord
   * @returns Token response
   */
  async exchangeCodeForToken(code: string): Promise<DiscordTokenResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Discord OAuth configuration is missing. Please set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and DISCORD_REDIRECT_URI environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: OAuthGrantType.AUTHORIZATION_CODE,
        redirect_uri: this.redirectUri,
      });

      const response = await firstValueFrom(
        this.httpService.post(this.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      this.loggerService.log(`${url} succeeded`, {
        hasAccessToken: !!response.data.access_token,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: this.getErrorDetail(
            error,
            'Failed to exchange code for token',
          ),
          title: 'Token Exchange Failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * The name of one server the user belongs to, for the channel label. Null
   * when the lookup fails; the label then falls back to the server id.
   */
  async getGuildName(
    accessToken: string,
    guildId: string,
  ): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<Array<{ id: string; name: string }>>(
          this.userGuildsUrl,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );
      return response.data.find((guild) => guild.id === guildId)?.name ?? null;
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} server name lookup failed`,
        { error: error instanceof Error ? error.name : 'unknown' },
      );
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * @param organizationId - Organization ID
   * @param brandId - Brand ID
   * @returns Updated credential
   */
  async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.clientId || !this.clientSecret) {
      throw new HttpException(
        {
          detail:
            'Discord OAuth configuration is missing. Please set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        // Token repair has to find the row even after a failed refresh
        // flipped `isConnected` off.
        isDisconnectedIncluded: true,
        organizationId,
        platform: CredentialPlatform.DISCORD,
      });

      if (!credential?.refreshToken) {
        throw new HttpException(
          {
            detail: 'Discord credential not found',
            title: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Decrypt refresh token
      const decryptedRefreshToken = EncryptionUtil.decrypt(
        credential.refreshToken,
      );

      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: OAuthGrantType.REFRESH_TOKEN,
        refresh_token: decryptedRefreshToken,
      });

      const response = await firstValueFrom(
        this.httpService.post(this.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // Update credential with new tokens
      const updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          refreshToken: refresh_token || credential.refreshToken,
        },
      );

      this.loggerService.log(`${url} token refreshed`, {
        credentialId: credential.id,
      });

      return updatedCredential;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);

      // Mark credential as disconnected if refresh fails
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        // Token repair has to find the row even after a failed refresh
        // flipped `isConnected` off.
        isDisconnectedIncluded: true,
        organizationId,
        platform: CredentialPlatform.DISCORD,
      });

      if (credential) {
        await this.credentialsService.patch(credential.id, {
          isConnected: false,
        });
      }

      throw new HttpException(
        {
          detail: this.getErrorDetail(error, 'Failed to refresh Discord token'),
          title: 'Refresh Failed',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
