import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/**
 * Authenticated dev.to (Forem) user as returned by `GET /users/me`.
 */
interface DevtoUser {
  id: number;
  username: string;
  name: string;
  profile_image: string;
}

/**
 * dev.to article as returned by `POST /articles`.
 */
interface DevtoArticle {
  id: number;
  title: string;
  description: string;
  slug: string;
  url: string;
  canonical_url: string | null;
  published: boolean;
  published_at: string | null;
  tag_list: string[];
}

/**
 * Options accepted when publishing an internal article to dev.to.
 */
interface DevtoPublishOptions {
  published?: boolean;
  tags?: string[];
  canonicalUrl?: string;
}

@Injectable()
export class DevtoService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly apiBase: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly articlesService: ArticlesService,
  ) {
    this.apiBase =
      this.configService.get('DEVTO_API_URL') ?? 'https://dev.to/api';
  }

  /**
   * Verify an API key by fetching the authenticated dev.to user.
   * dev.to authenticates with an `api-key` header (no OAuth).
   */
  async getCurrentUser(apiKey: string): Promise<DevtoUser> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get<DevtoUser>(`${this.apiBase}/users/me`, {
          headers: { 'api-key': apiKey },
        }),
      );

      this.loggerService.log(`${url} success`, {
        userId: response.data?.id,
        username: response.data?.username,
      });
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
      });
      throw error;
    }
  }

  /**
   * Publish an internal article to the brand's connected dev.to account.
   * When `published` is false the article is created as a dev.to draft.
   * `canonicalUrl` is only sent when explicitly provided so that dev.to
   * self-canonicalizes by default (avoids mis-attributed duplicate content).
   */
  async publishArticle(
    articleId: string,
    organizationId: string,
    brandId: string,
    options: DevtoPublishOptions = {},
  ): Promise<DevtoArticle> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { published = true, tags = [], canonicalUrl } = options;

    try {
      const apiKey = await this.getDecryptedApiKey(organizationId, brandId);

      const article = await this.articlesService.findOne({ _id: articleId });

      if (!article) {
        throw new Error('Article not found');
      }

      const articleBody: Record<string, unknown> = {
        body_markdown: article.content ?? '',
        published,
        tags,
        title: article.title,
      };

      if (article.excerpt) {
        articleBody.description = article.excerpt;
      }
      if (article.coverImageUrl) {
        articleBody.main_image = article.coverImageUrl;
      }
      if (canonicalUrl) {
        articleBody.canonical_url = canonicalUrl;
      }

      const response = await firstValueFrom(
        this.httpService.post<DevtoArticle>(
          `${this.apiBase}/articles`,
          { article: articleBody },
          {
            headers: {
              'api-key': apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const devtoArticle = response.data;

      this.loggerService.log(`${url} success`, {
        articleId,
        devtoArticleId: devtoArticle?.id,
        published,
      });
      return devtoArticle;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        articleId,
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
      });
      throw error;
    }
  }

  /**
   * Resolve and decrypt the stored dev.to API key for a brand.
   */
  async getDecryptedApiKey(
    organizationId: string,
    brandId: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.findOne({
      brand: brandId,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.DEV_TO,
    });

    if (!credential?.accessToken) {
      this.loggerService.error(`${url} dev.to credential not found`, {
        brandId,
        organizationId,
      });
      throw new Error(
        'dev.to credential not found. Please reconnect your account.',
      );
    }

    return EncryptionUtil.decrypt(credential.accessToken);
  }
}
