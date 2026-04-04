import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

interface MediumUser {
  id: string;
  username: string;
  name: string;
  url: string;
  imageUrl: string;
}

interface MediumPost {
  id: string;
  title: string;
  authorId: string;
  tags: string[];
  url: string;
  canonicalUrl: string;
  publishStatus: string;
  publishedAt: number;
  license: string;
  licenseUrl: string;
}

@Injectable()
export class MediumService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly MEDIUM_API_BASE = 'https://api.medium.com/v1';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly articlesService: ArticlesService,
  ) {}

  /**
   * Generate Medium OAuth URL
   */
  public generateAuthUrl(state: string): string {
    const clientId = this.configService.get('MEDIUM_CLIENT_ID');
    const redirectUri = this.configService.get('MEDIUM_REDIRECT_URI');
    const scope = 'basicProfile,publishPost';

    // @ts-expect-error TS2345
    return `https://medium.com/m/oauth/authorize?client_id=${clientId}&scope=${scope}&state=${state}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  /**
   * Exchange auth code for access token
   */
  public async exchangeAuthCodeForAccessToken(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.medium.com/v1/tokens',
          {
            client_id: this.configService.get('MEDIUM_CLIENT_ID'),
            client_secret: this.configService.get('MEDIUM_CLIENT_SECRET'),
            code,
            grant_type: OAuthGrantType.AUTHORIZATION_CODE,
            redirect_uri: this.configService.get('MEDIUM_REDIRECT_URI'),
          },
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_at,
        refreshToken: response.data.refresh_token,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get Medium user profile
   */
  public async getUserProfile(accessToken: string): Promise<MediumUser> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.MEDIUM_API_BASE}/me`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish article to Medium
   */
  public async publishArticle(
    articleId: string,
    organizationId: string,
    brandId: string,
    publishStatus: 'public' | 'draft' | 'unlisted' = 'public',
  ): Promise<MediumPost> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get Medium credentials
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isConnected: true,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.MEDIUM,
      });

      if (!credential) {
        throw new Error('Medium credential not found');
      }

      // Decrypt the access token
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      // Get article
      const article = await this.articlesService.findOne({ _id: articleId });

      if (!article) {
        throw new Error('Article not found');
      }

      // Get Medium user ID from credential
      const mediumUserId = credential.externalId;

      // Publish to Medium
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.MEDIUM_API_BASE}/users/${mediumUserId}/posts`,
          {
            canonicalUrl: `https://genfeed.ai/articles/${article.slug}`,
            content: article.content,
            contentFormat: 'html',
            publishStatus: publishStatus,
            tags: [], // Medium supports up to 3 tags
            title: article.label,
          },
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${decryptedAccessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const mediumPost = response.data.data;

      // Store Medium post reference in article
      await this.articlesService.patch(articleId, {
        $push: {
          posts: {
            externalId: mediumPost.id,
            platform: 'medium',
            publishedAt: new Date(mediumPost.publishedAt),
            url: mediumPost.url,
          },
        },
      } as unknown as Record<string, unknown>);

      return mediumPost;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Refresh Medium access token
   */
  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<unknown> {
    const queryCredentials = {
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.MEDIUM,
    };

    const credentials = await this.credentialsService.findOne(queryCredentials);

    if (!credentials) {
      throw new Error('Medium credential not found');
    }

    try {
      if (credentials.refreshToken) {
        // Decrypt the refresh token before use
        const decryptedRefreshToken = EncryptionUtil.decrypt(
          credentials.refreshToken,
        );

        const response = await firstValueFrom(
          this.httpService.post(
            'https://api.medium.com/v1/tokens',
            {
              client_id: this.configService.get('MEDIUM_CLIENT_ID'),
              client_secret: this.configService.get('MEDIUM_CLIENT_SECRET'),
              grant_type: OAuthGrantType.REFRESH_TOKEN,
              refresh_token: decryptedRefreshToken,
            },
            {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            },
          ),
        );

        return await this.credentialsService.patch(credentials._id, {
          accessToken: response.data.access_token,
          accessTokenExpiry: response.data.expires_at
            ? new Date(response.data.expires_at * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          refreshToken: response.data.refresh_token || credentials.refreshToken,
        });
      }

      return credentials;
    } catch (error: unknown) {
      this.loggerService.error('Refresh token failed', error);
      await this.credentialsService.patch(credentials._id, {
        isConnected: false,
      });
      throw error;
    }
  }
}
