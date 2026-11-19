import type { CredentialPatch } from '@api/collections/credentials/credential.types';
import { CredentialRefreshRejectedException } from '@api/collections/credentials/credential-refresh-rejected.exception';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  buildGrantedScopesCredentialPatch,
  readOAuthTokenScopeField,
} from '@genfeedai/helpers';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

@Traced()
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
      // Direct callers can still receive reconnect guidance for a disconnected channel.
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

      throw new CredentialRefreshRejectedException(
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

    let refreshToken: string;
    try {
      refreshToken = EncryptionUtil.decrypt(credentials.refreshToken);
    } catch {
      throw new Error('Could not decrypt the YouTube refresh token');
    }

    if (refreshToken.length < 50) {
      this.loggerService.warn('Refresh token seems too short', {
        length: refreshToken.length,
      });
    }
    oauthClient.setCredentials({ refresh_token: refreshToken });

    try {
      await oauthClient.getAccessToken();
    } catch (error: unknown) {
      const response =
        isRecord(error) && isRecord(error.response) ? error.response : null;
      if (isRecord(response?.data) && response.data.error === 'invalid_grant') {
        if (credentials.isConnected) {
          await this.credentialsService.patch(credentials.id, {
            isConnected: false,
          });
        }
        throw new CredentialRefreshRejectedException({
          detail:
            'Your YouTube connection has expired or been revoked. Please reconnect your YouTube account.',
          title: 'YouTube Authentication Failed',
        });
      }
      const status =
        typeof response?.status === 'number'
          ? ` (HTTP ${response.status})`
          : '';
      throw new BadGatewayException(`YouTube token refresh failed${status}`);
    }

    const newCredentials = oauthClient.credentials;
    if (!newCredentials?.access_token) {
      throw new BadGatewayException(
        'Failed to obtain access token from refresh',
      );
    }

    const updateData: CredentialPatch = {
      accessToken: newCredentials.access_token,
      isConnected: true,
      isDeleted: false,
    };
    if (
      newCredentials.refresh_token &&
      newCredentials.refresh_token !== refreshToken
    ) {
      updateData.refreshToken = newCredentials.refresh_token;
    }
    if (newCredentials.expiry_date) {
      updateData.accessTokenExpiry = new Date(newCredentials.expiry_date);
    }
    const grantedScopesPatch = buildGrantedScopesCredentialPatch(
      readOAuthTokenScopeField(newCredentials),
    );
    await this.credentialsService.patch(credentials.id, {
      ...updateData,
      ...grantedScopesPatch,
    });
    return oauthClient;
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
