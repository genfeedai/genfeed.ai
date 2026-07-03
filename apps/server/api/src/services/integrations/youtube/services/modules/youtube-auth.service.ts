import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class YoutubeAuthService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {}

  async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<OAuth2Client> {
    const queryCredentials = {
      brand: brandId,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.YOUTUBE,
    };

    const credentials = await this.credentialsService.findOne(queryCredentials);

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
    const oauthClient = YoutubeOAuth2Util.createClient(
      this.configService.get('YOUTUBE_CLIENT_ID')!,
      // @ts-expect-error TS2345
      this.configService.get<string>('YOUTUBE_CLIENT_SECRET'),
      this.configService.get<string>('YOUTUBE_REDIRECT_URI'),
    );

    try {
      this.loggerService.log('Refreshing YouTube token', {
        brandId,
        // @ts-expect-error TS2339
        clientId: `${this.configService.get<string>('YOUTUBE_CLIENT_ID')?.substring(0, 20)}...`,
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

      const updateData: Record<string, unknown> = {
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

      await this.credentialsService.patch(
        credentials.id,
        updateData as Partial<UpdateCredentialDto>,
      );

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
}
