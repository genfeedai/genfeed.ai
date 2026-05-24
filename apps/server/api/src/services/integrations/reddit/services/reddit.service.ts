import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RedditService {
  private readonly oauthUrl = 'https://www.reddit.com/api/v1/authorize';
  private readonly tokenUrl = 'https://www.reddit.com/api/v1/access_token';
  private readonly apiUrl = 'https://oauth.reddit.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
  ) {}

  private requireAccessToken(credential: CredentialDocument): string {
    if (!credential.accessToken) {
      throw new Error('Reddit credential missing access token');
    }

    return credential.accessToken;
  }

  public generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.get('REDDIT_CLIENT_ID'),
      duration: 'permanent',
      redirect_uri: this.configService.get('REDDIT_REDIRECT_URI'),
      response_type: 'code',
      scope: 'identity submit',
      state,
    } as Record<string, string>);
    return `${this.oauthUrl}?${params.toString()}`;
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.findOne({
      brand: brandId,
      organization: organizationId,
      platform: CredentialPlatform.REDDIT,
    });

    if (!credential?.refreshToken) {
      throw new Error('Reddit credential not found');
    }

    // Decrypt the refresh token before use
    const decryptedRefreshToken = EncryptionUtil.decrypt(
      credential.refreshToken,
    );

    const auth = Buffer.from(
      `${this.configService.get('REDDIT_CLIENT_ID')}:${this.configService.get('REDDIT_CLIENT_SECRET')}`,
    ).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', OAuthGrantType.REFRESH_TOKEN);
    params.append('refresh_token', decryptedRefreshToken);

    const response = await firstValueFrom(
      this.httpService.post(this.tokenUrl, params.toString(), {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    const { access_token, refresh_token, expires_in } = response.data;

    return this.credentialsService.patch(credential._id, {
      accessToken: access_token,
      accessTokenExpiry: expires_in
        ? new Date(Date.now() + expires_in * 1000)
        : undefined,
      isConnected: true,
      isDeleted: false,
      refreshToken: refresh_token || credential.refreshToken,
    });
  }

  public async getAccountDetails(
    organizationId: string,
    brandId: string,
  ): Promise<unknown> {
    const credential = await this.refreshToken(organizationId, brandId);

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireAccessToken(credential),
    );

    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    return response.data;
  }

  /**
   * Post a comment on a Reddit submission
   * @param organizationId The organization ID
   * @param brandId The brand ID
   * @param thingId The Reddit thing ID (t3_xxx for posts)
   * @param text The comment text
   * @returns The comment ID
   */
  public async postComment(
    organizationId: string,
    brandId: string,
    thingId: string,
    text: string,
  ): Promise<{ commentId: string }> {
    const credential = await this.refreshToken(organizationId, brandId);

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireAccessToken(credential),
    );

    // Reddit expects thing_id in format t3_xxx for posts
    const fullThingId = thingId.startsWith('t3_') ? thingId : `t3_${thingId}`;

    const params = new URLSearchParams();
    params.append('thing_id', fullThingId);
    params.append('text', text);
    params.append('api_type', 'json');

    const response = await firstValueFrom(
      this.httpService.post(`${this.apiUrl}/api/comment`, params.toString(), {
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    const commentId =
      response.data?.json?.data?.things?.[0]?.data?.id ||
      response.data?.json?.data?.id;

    return { commentId };
  }

  public async submitPost(
    organizationId: string,
    brandId: string,
    subreddit: string,
    title: string,
    text?: string,
    url?: string,
  ): Promise<string> {
    const credential = await this.refreshToken(organizationId, brandId);

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireAccessToken(credential),
    );

    const params = new URLSearchParams();
    params.append('sr', subreddit);
    params.append('title', title);
    params.append('kind', text ? 'self' : 'link');
    if (text) {
      params.append('text', text);
    }
    if (url) {
      params.append('url', url);
    }

    const response = await firstValueFrom(
      this.httpService.post(`${this.apiUrl}/api/submit`, params.toString(), {
        headers: {
          Authorization: `Bearer ${decryptedAccessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':
            this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
        },
      }),
    );

    return response.data?.json?.data?.id;
  }
}
