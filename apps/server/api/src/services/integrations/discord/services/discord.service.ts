import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DiscordService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly clientId: string | undefined;

  private readonly clientSecret: string | undefined;

  private readonly redirectUri: string | undefined;

  private readonly authUrl = 'https://discord.com/api/oauth2/authorize';
  private readonly tokenUrl = 'https://discord.com/api/oauth2/token';
  private readonly userUrl = 'https://discord.com/api/users/@me';

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
      scope: 'identify email',
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
  async exchangeCodeForToken(code: string) {
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
          detail:
            (error as unknown).response?.data?.error_description ||
            'Failed to exchange code for token',
          title: 'Token Exchange Failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get Discord user information
   *
   * @param accessToken - Discord access token
   * @returns User information
   */
  async getUserInfo(accessToken: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.userUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );

      this.loggerService.log(`${url} succeeded`, {
        userId: response.data.id,
        username: response.data.username,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail:
            (error as unknown).response?.data?.message ||
            'Failed to get Discord user info',
          title: 'Get User Failed',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * @param organizationId - Organization ID
   * @param brandId - Brand ID
   * @returns Updated credential
   */
  async refreshToken(organizationId: string, brandId: string) {
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
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.DISCORD,
      });

      if (!credential || !credential.refreshToken) {
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
        credential._id,
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
        credentialId: credential._id,
      });

      return updatedCredential;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);

      // Mark credential as disconnected if refresh fails
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.DISCORD,
      });

      if (credential) {
        await this.credentialsService.patch(credential._id, {
          isConnected: false,
        });
      }

      throw new HttpException(
        {
          detail:
            (error as unknown).response?.data?.error_description ||
            'Failed to refresh Discord token',
          title: 'Refresh Failed',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Disconnect Discord account
   *
   * @param organizationId - Organization ID
   * @param brandId - Brand ID
   */
  async disconnect(organizationId: string, brandId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.DISCORD,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Discord credential not found',
            title: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      await this.credentialsService.patch(credential._id, {
        isConnected: false,
        isDeleted: true,
      });

      this.loggerService.log(`${url} disconnected credential`, {
        credentialId: credential._id,
      });

      return { success: true };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error).message || 'Failed to disconnect Discord',
          title: 'Disconnect Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
