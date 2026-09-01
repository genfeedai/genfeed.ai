import { API_ENDPOINTS } from '@genfeedai/constants';
import { type ArticleCategory, ArticleStatus } from '@genfeedai/enums';
import type { ScoreSeoRequest } from '@genfeedai/interfaces';
import { Article } from '@genfeedai/models/content/article.model';
import { ArticleSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface GenerateArticlesRequest {
  prompt: string;
  count?: number;
  category?: ArticleCategory;
  credential?: string;
  keywords?: string[];
  type?: 'standard' | 'x-article';
  tone?: string;
  targetWordCount?: number;
  generateHeaderImage?: boolean;
}

export interface TwitterThread {
  order: number;
  content: string;
  characterCount: number;
}

export interface TwitterThreadResponse {
  tweets: TwitterThread[];
  totalTweets: number;
}

export interface ArticlePromptVersion {
  id: string;
  version: number;
  prompt: string;
  result: string; // JSON stringified { title, summary, content }
  assistant: string;
  createdAt: string;
}

export interface ArticleVersionResponse {
  articleId: string;
  prompts: ArticlePromptVersion[];
  totalVersions: number;
}

export interface ArticleReviewRubric {
  score: number;
  summary: string;
  strengths: string[];
  issues: Array<{
    severity: 'low' | 'medium' | 'high';
    category: string;
    message: string;
    recommendation: string;
  }>;
  revisionInstructions: string;
}

export class ArticlesService extends BaseService<Article> {
  constructor(token: string) {
    super(API_ENDPOINTS.ARTICLES, token, Article, ArticleSerializer);
  }

  public static getInstance(token: string): ArticlesService {
    return BaseService.getDataServiceInstance(ArticlesService, token);
  }

  /**
   * Find article by slug
   */
  public async findBySlug(slug: string): Promise<Article> {
    return await this.instance
      .get<JsonApiResponseDocument>(`slug/${slug}`)
      .then((res) => this.mapOne(res.data));
  }

  /**
   * Find public articles (no authentication required on backend)
   */
  public async findPublicArticles(query?: unknown): Promise<Article[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('public', {
        params: query,
      })
      .then((res) => this.mapMany(res.data));
  }

  /**
   * Find public article by slug (no authentication required)
   */
  public async findPublicArticleBySlug(slug: string): Promise<Article> {
    return await this.instance
      .get<JsonApiResponseDocument>(`public/slug/${slug}`)
      .then((res) => this.mapOne(res.data));
  }

  /**
   * Publish article (change status to PUBLISHED)
   */
  public async publish(id: string): Promise<Article> {
    return await this.patch(id, {
      publishedAt: new Date(),
      status: ArticleStatus.PUBLISHED,
    } as Record<string, unknown>);
  }

  /**
   * Archive article (change status to ARCHIVED)
   */
  public async archive(id: string): Promise<Article> {
    return await this.patch(id, {
      status: ArticleStatus.ARCHIVED,
    } as Record<string, unknown>);
  }

  /**
   * Unarchive article (change status to DRAFT)
   */
  public async unarchive(id: string): Promise<Article> {
    return await this.patch(id, {
      status: ArticleStatus.DRAFT,
    } as Record<string, unknown>);
  }

  /**
   * Generate articles using OpenAI assistant
   */
  public async generateArticles(
    data: GenerateArticlesRequest,
  ): Promise<Article[]> {
    return await this.instance
      .post<JsonApiResponseDocument>('generations', data)
      .then((res) => this.mapMany(res.data));
  }

  /**
   * Convert article to Twitter thread
   */
  public async convertToThread(id: string): Promise<TwitterThreadResponse> {
    return await this.instance
      .post<TwitterThreadResponse>(`${id}/thread-conversions`, {})
      .then((res) => res.data);
  }

  /**
   * Analyze article virality
   */
  public async analyzeVirality(id: string): Promise<unknown> {
    return await this.instance
      .post<unknown>(`/${id}/virality-analyses`, {})
      .then((res) => res.data);
  }

  public async scoreSeo(
    id: string,
    data: ScoreSeoRequest = {},
  ): Promise<Article> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/${id}/seo-scores`, data)
      .then((res) => this.mapOne(res.data));
  }

  public async review(
    id: string,
    data?: { focus?: string; includeLineEdits?: boolean },
  ): Promise<ArticleReviewRubric> {
    return await this.instance
      .post<ArticleReviewRubric>(`/${id}/reviews`, data || {})
      .then((res) => res.data);
  }

  /**
   * Get version history for an article
   */
  public async getVersions(id: string): Promise<ArticleVersionResponse> {
    return await this.instance
      .get<ArticleVersionResponse>(`/${id}/versions`)
      .then((res) => res.data);
  }

  /**
   * Restore article to a specific version (prompt)
   */
  public async restoreVersion(id: string, promptId: string): Promise<Article> {
    return await this.patch(id, {
      restoreFromVersionId: promptId,
    } as Record<string, unknown>);
  }

  /**
   * Generate prompt from article content
   */
  public async generatePrompt(id: string): Promise<{ prompt: string }> {
    return await this.instance
      .post<{ prompt: string }>(`/${id}/prompts`, {})
      .then((res) => res.data);
  }

  /**
   * Generate image from article
   */
  public async generateImage(
    id: string,
    options?: { model?: string; width?: number; height?: number },
  ): Promise<unknown> {
    return await this.instance
      .post(`/${id}/images`, options || {})
      .then((res) => res.data);
  }

  /**
   * Generate video from article
   */
  public async generateVideo(
    id: string,
    options?: { model?: string; duration?: number },
  ): Promise<unknown> {
    return await this.instance
      .post(`/${id}/videos`, options || {})
      .then((res) => res.data);
  }
}
