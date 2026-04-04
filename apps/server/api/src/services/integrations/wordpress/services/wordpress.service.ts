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

interface WordpressTokenResponse {
  access_token: string;
  token_type: string;
  blog_id: string;
  blog_url: string;
}

interface WordpressPostResponse {
  ID: number;
  URL: string;
  slug: string;
  title: string;
  status: string;
}

interface WordpressPostStats {
  views: number;
  visitors: number;
  likes: number;
  comments: number;
}

@Injectable()
export class WordpressService {
  private readonly constructorName = String(this.constructor.name);
  private readonly baseUrl = 'https://public-api.wordpress.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  public generateAuthUrl(state: string): string {
    const clientId = this.configService.get('WORDPRESS_CLIENT_ID');
    const redirectUri = this.configService.get('WORDPRESS_REDIRECT_URI');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    } as Record<string, string>);
    return `${this.baseUrl}/oauth2/authorize?${params.toString()}`;
  }

  public async exchangeCodeForToken(
    code: string,
  ): Promise<{ accessToken: string; blogId: string; blogUrl: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const clientId = this.configService.get('WORDPRESS_CLIENT_ID');
      const clientSecret = this.configService.get('WORDPRESS_CLIENT_SECRET');
      const redirectUri = this.configService.get('WORDPRESS_REDIRECT_URI');

      const response = await firstValueFrom(
        this.httpService.post<WordpressTokenResponse>(
          `${this.baseUrl}/oauth2/token`,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: OAuthGrantType.AUTHORIZATION_CODE,
            redirect_uri: redirectUri,
          } as Record<string, string>).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        blogId: response.data.blog_id,
        blogUrl: response.data.blog_url,
      });

      return {
        accessToken: response.data.access_token,
        blogId: response.data.blog_id,
        blogUrl: response.data.blog_url,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<{ isValid: boolean }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      // WordPress.com tokens are long-lived and do not expire.
      // Verify the credential exists and is valid by making a test API call.
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.WORDPRESS,
      });

      if (!credential?.accessToken) {
        throw new Error(
          'WordPress credential not found or missing access token',
        );
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      // Validate token by fetching the current user
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/rest/v1.1/me`, {
          headers: { Authorization: `Bearer ${decryptedAccessToken}` },
        }),
      );

      this.loggerService.log(`${url} token is valid`, {
        credentialId: credential._id,
      });

      return { isValid: true };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async createPost(
    accessToken: string,
    siteId: string,
    title: string,
    content: string,
    status: string = 'publish',
    categories?: string[],
    tags?: string[],
    featuredImage?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const postData: Record<string, unknown> = {
        content,
        status,
        title,
      };

      if (categories && categories.length > 0) {
        postData.categories = categories.join(',');
      }

      if (tags && tags.length > 0) {
        postData.tags = tags.join(',');
      }

      if (featuredImage) {
        postData.featured_image = featuredImage;
      }

      const response = await firstValueFrom(
        this.httpService.post<WordpressPostResponse>(
          `${this.baseUrl}/rest/v1.1/sites/${siteId}/posts/new`,
          postData,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        postId: response.data.ID,
        postUrl: response.data.URL,
      });

      return String(response.data.ID);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getPostAnalytics(
    accessToken: string,
    siteId: string,
    postId: string,
  ): Promise<WordpressPostStats> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get<WordpressPostStats>(
          `${this.baseUrl}/rest/v1.1/sites/${siteId}/stats/post/${postId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      this.loggerService.log(`${url} success`, response.data);
      return response.data;
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
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.warn(
      `${url} WordPress analytics not fully implemented yet`,
      {
        brandId,
        externalId,
        organizationId,
      },
    );

    return await Promise.resolve({
      comments: 0,
      likes: 0,
      views: 0,
    });
  }
}
