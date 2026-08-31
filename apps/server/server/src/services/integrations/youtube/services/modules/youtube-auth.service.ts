import { CredentialPlatform } from '@genfeedai/enums';
import {
  buildGrantedScopesCredentialPatch,
  readOAuthTokenScopeField,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CredentialPatch } from '@server/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@server/server.dependencies';
import { YoutubeOAuth2Util } from '@server/shared/utils/youtube-oauth/youtube-oauth.util';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class YoutubeAuthService {
  constructor(
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * @param credentialId - which connected YouTube channel this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<OAuth2Client> {
    const credentials = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // A failed refresh flips isConnected off; the retry still has to find it.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.YOUTUBE,
    });

    if (!credentials) {
      throw new Error('Youtube credential not found');
    }

    if (!credentials.refreshToken) {
      await this.credentialsService.patch(credentials.id, {
        isConnected: false,
        isDeleted: false,
      });

      throw new Error(
        'Youtube refresh token not found. Please reconnect your account.',
      );
    }

    // Create a new OAuth2 client instance per request to avoid race conditions
    // and credential mixing between concurrent users. This client will be returned
    // and passed as the 'auth' parameter to individual API calls.
    const clientId = this.requireOAuthConfig('GOOGLE_OAUTH_CLIENT_ID');
    const oauthClient = YoutubeOAuth2Util.createClient(
      clientId,
      this.requireOAuthConfig('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.requireOAuthConfig('YOUTUBE_REDIRECT_URI'),
    );

    try {
      this.loggerService.log('Refreshing YouTube token', {
        brandId,
        clientId: `${clientId.substring(0, 20)}...`,
        hasRefreshToken: !!credentials.refreshToken,
        organizationId,
        redirectUri: this.configService.get<string>('YOUTUBE_REDIRECT_URI'),
        refreshTokenExpiry: credentials.refreshTokenExpiry,
      });

      const decryptedRefreshToken = credentials.refreshToken
        ? EncryptionUtil.decrypt(credentials.refreshToken)
        : null;

      if (!decryptedRefreshToken) {
        throw new Error('Failed to decrypt refresh token');
      }

      // Never log token previews (plaintext or ciphertext) — only safe signals.
      if (decryptedRefreshToken.length < 50) {
        this.loggerService.warn('Refresh token seems too short', {
          length: decryptedRefreshToken.length,
        });
      }

      await oauthClient.setCredentials({
        refresh_token: decryptedRefreshToken,
      });

      this.loggerService.log('Credentials set, attempting token refresh', {
        credentialKeys: oauthClient.credentials
          ? Object.keys(oauthClient.credentials)
          : [],
        hasCredentials: !!oauthClient.credentials,
      });

      const tokenResponse = await oauthClient.getAccessToken();

      this.loggerService.log('Token refresh response', {
        hasRes: !!tokenResponse.res,
        hasToken: !!tokenResponse.token,
        tokenKeys: typeof tokenResponse.token === 'string' ? ['token'] : [],
      });

      const newCredentials = oauthClient.credentials;

      if (!newCredentials?.access_token) {
        this.loggerService.warn('No access token in refresh response', {
          credentialsKeys: newCredentials ? Object.keys(newCredentials) : [],
        });
        throw new Error('Failed to obtain access token from refresh');
      }

      const updateData: CredentialPatch = {
        accessToken: newCredentials.access_token,
        isConnected: true,
        isDeleted: false,
      };

      if (newCredentials.refresh_token) {
        updateData.refreshToken = newCredentials.refresh_token;
        this.loggerService.log('New refresh token received');
      }

      if (newCredentials.expiry_date) {
        updateData.accessTokenExpiry = new Date(newCredentials.expiry_date);
      }

      const grantedScopesPatch = buildGrantedScopesCredentialPatch(
        readOAuthTokenScopeField(newCredentials),
      );
      if (grantedScopesPatch) {
        Object.assign(updateData, grantedScopesPatch);
      }

      await this.credentialsService.patch(credentials.id, updateData);

      // Return the authenticated OAuth2 client to be used for API calls
      return oauthClient;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: Record<string, unknown> };
        code?: string;
      };
      this.loggerService.error(
        'Refresh token failed',
        axiosError?.response || error,
      );

      const isInvalidGrant =
        axiosError?.response?.data?.error === 'invalid_grant' ||
        (error as Error)?.message?.includes('invalid_grant') ||
        axiosError?.code === 'invalid_grant';

      await this.credentialsService.patch(credentials.id, {
        isConnected: false,
        isDeleted: false,
      });

      if (isInvalidGrant) {
        throw new HttpException(
          {
            detail:
              'Your YouTube connection has expired or been revoked. Please reconnect your YouTube account.',
            title: 'YouTube Authentication Failed',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw error;
    }
  }

  private requireOAuthConfig(
    key:
      | 'GOOGLE_OAUTH_CLIENT_ID'
      | 'GOOGLE_OAUTH_CLIENT_SECRET'
      | 'YOUTUBE_REDIRECT_URI',
  ): string {
    const value = this.configService.get<string>(key);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is not configured`);
    }

    return value;
  }
}
