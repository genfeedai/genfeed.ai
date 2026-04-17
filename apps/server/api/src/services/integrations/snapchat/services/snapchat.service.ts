import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SnapchatService {
  private readonly constructorName = String(this.constructor.name);
  private readonly baseUrl = 'https://adsapi.snapchat.com/v1';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  public generateAuthUrl(state: string): string {
    const clientId = this.configService.get('SNAPCHAT_CLIENT_ID');
    const redirectUri = this.configService.get('SNAPCHAT_REDIRECT_URI');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'snapchat-marketing-api',
      state,
    } as Record<string, string>);
    return `https://accounts.snapchat.com/login/oauth2/authorize?${params.toString()}`;
  }

  public async exchangeCodeForToken(
    code: string,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const clientId = this.configService.get('SNAPCHAT_CLIENT_ID');
      const clientSecret = this.configService.get('SNAPCHAT_CLIENT_SECRET');
      const redirectUri = this.configService.get('SNAPCHAT_REDIRECT_URI');

      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );

      const response = await firstValueFrom(
        this.httpService.post(
          'https://accounts.snapchat.com/login/oauth2/access_token',
          {
            code,
            grant_type: OAuthGrantType.AUTHORIZATION_CODE,
            redirect_uri: redirectUri,
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, response.data);
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiry?: Date;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.SNAPCHAT,
      });

      if (!credential?.refreshToken) {
        throw new Error(
          'Snapchat credential not found or missing refresh token',
        );
      }

      const decryptedRefreshToken = EncryptionUtil.decrypt(
        credential.refreshToken,
      );

      const clientId = this.configService.get('SNAPCHAT_CLIENT_ID');
      const clientSecret = this.configService.get('SNAPCHAT_CLIENT_SECRET');

      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );

      const response = await firstValueFrom(
        this.httpService.post(
          'https://accounts.snapchat.com/login/oauth2/access_token',
          {
            grant_type: OAuthGrantType.REFRESH_TOKEN,
            refresh_token: decryptedRefreshToken,
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          },
        ),
      );

      const { access_token, refresh_token, expires_in } = response.data;

      this.loggerService.log(`${url} success`, {
        credentialId: credential._id,
        hasNewRefreshToken: !!refresh_token,
      });

      return this.credentialsService.patch(credential._id, {
        accessToken: access_token,
        accessTokenExpiry: expires_in
          ? new Date(Date.now() + expires_in * 1000)
          : undefined,
        isConnected: true,
        isDeleted: false,
        refreshToken: refresh_token || credential.refreshToken,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async createMedia(
    accessToken: string,
    adAccountId: string,
    mediaUrl: string,
    name: string,
    type: 'IMAGE' | 'VIDEO',
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/adaccounts/${adAccountId}/media`,
          {
            media: [
              {
                media_url: mediaUrl,
                name,
                type,
              },
            ],
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      const mediaId = response.data?.media?.[0]?.media?.id;
      this.loggerService.log(`${url} success`, { mediaId });
      return mediaId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async publishStory(
    accessToken: string,
    adAccountId: string,
    mediaId: string,
    headline?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/adaccounts/${adAccountId}/creatives`,
          {
            creatives: [
              {
                ad_account_id: adAccountId,
                headline,
                media_id: mediaId,
                type: 'SNAP_AD',
              },
            ],
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      const creativeId = response.data?.creatives?.[0]?.creative?.id;
      this.loggerService.log(`${url} success`, { creativeId });
      return creativeId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    externalId: string,
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    impressions?: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.warn(
      `${url} Snapchat analytics not fully implemented yet`,
      {
        brandId,
        externalId,
        organizationId,
      },
    );

    return await Promise.resolve({
      comments: 0,
      impressions: 0,
      likes: 0,
      views: 0,
    });
  }
}
