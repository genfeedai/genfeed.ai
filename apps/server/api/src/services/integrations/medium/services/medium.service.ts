import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly articlesService: ArticlesService,
  ) {
    this.clientId = this.configService.get('MEDIUM_CLIENT_ID');
    this.clientSecret = this.configService.get('MEDIUM_CLIENT_SECRET');
    this.redirectUri = this.configService.get('MEDIUM_REDIRECT_URI');
  }

  /**
   * Generate Medium OAuth URL
   */
  public generateAuthUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Medium OAuth configuration is missing. Please set MEDIUM_CLIENT_ID and MEDIUM_REDIRECT_URI environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'basicProfile,publishPost',
      state,
    });

    return `https://medium.com/m/oauth/authorize?${params.toString()}`;
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

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Medium OAuth configuration is missing. Please set MEDIUM_CLIENT_ID, MEDIUM_CLIENT_SECRET, and MEDIUM_REDIRECT_URI environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://api.medium.com/v1/tokens',
          {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code,
            grant_type: OAuthGrantType.AUTHORIZATION_CODE,
            redirect_uri: this.redirectUri,
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
    credentialId?: string,
  ): Promise<MediumPost> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get Medium credentials
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        organizationId,
        platform: CredentialPlatform.MEDIUM,
      });

      if (!credential) {
        throw new Error('Medium credential not found');
      }

      if (!credential.accessToken) {
        throw new Error('Medium credential is missing an access token');
      }

      // Decrypt the access token
      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      // Get article
      const article = await this.articlesService.findOne({ id: articleId });

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
      const existingPosts = Array.isArray(article.posts)
        ? (article.posts as unknown[])
        : [];
      await this.articlesService.patch(articleId, {
        posts: [
          ...existingPosts,
          {
            externalId: mediumPost.id,
            platform: 'medium',
            publishedAt: new Date(mediumPost.publishedAt),
            url: mediumPost.url,
          },
        ],
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
    credentialId?: string,
  ): Promise<unknown> {
    const credentials = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // Token repair has to find the row even after a failed refresh
      // flipped `isConnected` off.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.MEDIUM,
    });

    if (!credentials) {
      throw new Error('Medium credential not found');
    }

    if (credentials.refreshToken && (!this.clientId || !this.clientSecret)) {
      throw new HttpException(
        {
          detail:
            'Medium OAuth configuration is missing. Please set MEDIUM_CLIENT_ID and MEDIUM_CLIENT_SECRET environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
              client_id: this.clientId,
              client_secret: this.clientSecret,
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

        return await this.credentialsService.patch(credentials.id, {
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
      await this.credentialsService.patch(credentials.id, {
        isConnected: false,
      });
      throw error;
    }
  }
}
