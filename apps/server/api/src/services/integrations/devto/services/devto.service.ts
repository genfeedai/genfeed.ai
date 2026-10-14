import { ConfigService } from '@libs/config/config.service';
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
 * Article body the scheduler publisher sends. Markdown is already converted
 * from the stored HTML; this method does not load or reshape an Article.
 */
export interface DevtoCreateArticleInput {
  bodyMarkdown: string;
  published: boolean;
  tags: string[];
  title: string;
}

@Injectable()
export class DevtoService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly apiBase: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
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
   * Create a dev.to article for an API key the publisher already decrypted
   * from `PublishContext.credential`. `published: false` stores a draft.
   * No canonical URL is sent; dev.to self-canonicalizes.
   */
  async createArticle(
    apiKey: string,
    input: DevtoCreateArticleInput,
  ): Promise<DevtoArticle> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const article: Record<string, unknown> = {
      body_markdown: input.bodyMarkdown,
      published: input.published,
      title: input.title,
    };
    if (input.tags.length > 0) {
      article.tags = input.tags;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<DevtoArticle>(
          `${this.apiBase}/articles`,
          { article },
          {
            headers: {
              'api-key': apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        devtoArticleId: response.data?.id,
        published: input.published,
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
}
