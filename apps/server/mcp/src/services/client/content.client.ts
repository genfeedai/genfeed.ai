import {
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ArticleResource,
  PostResource,
  TrendResource,
} from '@mcp/shared/interfaces/api-response.interface';
import type {
  ArticleCreationParams,
  ArticleResponse,
  ArticleSearchParams,
  ArticleSearchResult,
} from '@mcp/shared/interfaces/article.interface';
import type {
  PostListParams,
  PostResponse,
  PublishContentParams,
  TrendingTopic,
  TrendingTopicsParams,
} from '@mcp/shared/interfaces/post.interface';
import {
  toPlatform,
  toPostStatus,
  toPostVisibility,
  toTargetExecutionState,
} from '@mcp/tools/tool-validators';
import type { BaseApiClient } from './base-api-client';
import { CONTENT_STATUS } from './client.types';

/** Mirrors `MaxLength(500)` on the API's `GenerateArticlesDto.prompt`. */
const ARTICLE_PROMPT_MAX_LENGTH = 500;

/**
 * The `create_article` tool speaks `topic` / `length` / `targetAudience`; the
 * API's `GenerateArticlesDto` speaks `prompt` (plus `tone` and `keywords`).
 * The API validates with `whitelist: true` and no `forbidNonWhitelisted`, so
 * undeclared keys are deleted silently — sending `topic` meant the body reached
 * the controller without the required `prompt` and every call 400'd.
 *
 * Fold the tool's framing into the prompt instead of inventing DTO fields: the
 * generation prompt is free text, and the API has no separate audience or
 * length input for standard articles.
 */
function buildArticlePrompt(params: ArticleCreationParams): string {
  const framing = [
    params.targetAudience
      ? `Write it for this audience: ${params.targetAudience}.`
      : undefined,
    params.length ? `Length: ${params.length}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const prompt = framing ? `${params.topic}\n\n${framing}` : params.topic;

  return prompt.slice(0, ARTICLE_PROMPT_MAX_LENGTH);
}

/**
 * `wordCount` is not a serialized article attribute — derive it from the
 * content the API did return rather than reporting a hardcoded 0.
 */
function countWords(content: string): number {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Articles, social posts/publishing, and trending topics. */
export class ContentClient {
  constructor(private readonly base: BaseApiClient) {}

  createArticle(params: ArticleCreationParams): Promise<ArticleResponse> {
    this.base.logger.debug('Creating article', { params });

    return this.base.request(
      'creating article',
      async (http) => {
        const response = await http.post('/articles/generations', {
          data: {
            attributes: {
              keywords: params.keywords || [],
              prompt: buildArticlePrompt(params),
              tone: params.tone || 'professional',
            },
            type: 'articles',
          },
        });

        // A standard generation is serialized as a collection (one resource per
        // generated article), so the envelope holds an array here.
        const payload = response.data?.data;
        const article = Array.isArray(payload) ? payload[0] : payload;
        const content = article?.attributes?.content || '';

        return {
          content,
          createdAt: article?.attributes?.createdAt || new Date().toISOString(),
          id: article?.id || article?.attributes?.id,
          status: article?.attributes?.status || CONTENT_STATUS.PROCESSING,
          title: article?.attributes?.label || params.topic,
          wordCount: countWords(content),
        };
      },
      this.base.failWithDetail('Failed to create article'),
    );
  }

  searchArticles(params: ArticleSearchParams): Promise<ArticleSearchResult[]> {
    this.base.logger.debug('Searching articles', { params });

    return this.base.request(
      'searching articles',
      async (http) => {
        const response = await http.get('/articles', {
          params: {
            'filter[category]': params.category,
            'filter[search]': params.query,
            'page[limit]': params.limit || 10,
            'page[offset]': params.offset || 0,
          },
        });

        return (
          response.data?.data?.map((article: ArticleResource) => ({
            category: article.attributes?.category,
            createdAt: article.attributes?.createdAt,
            excerpt:
              article.attributes?.summary ||
              article.attributes?.content?.substring(0, 200),
            id: article.id,
            title: article.attributes?.label,
          })) || []
        );
      },
      this.base.failWith('Failed to search articles'),
    );
  }

  getArticle(articleId: string): Promise<ArticleResponse> {
    this.base.logger.debug(`Getting article: ${articleId}`);

    return this.base.request(
      'getting article',
      async (http) => {
        const response = await http.get(`/articles/${articleId}`);
        const article = response.data?.data;
        const content = article?.attributes?.content || '';

        return {
          content,
          createdAt: article?.attributes?.createdAt,
          id: article?.id,
          status: article?.attributes?.status || CONTENT_STATUS.PUBLISHED,
          title: article?.attributes?.label,
          updatedAt: article?.attributes?.updatedAt,
          wordCount: countWords(content),
        };
      },
      this.base.failWith('Failed to get article'),
    );
  }

  publishContent(params: PublishContentParams): Promise<PostResponse[]> {
    this.base.logger.debug('Publishing content', { params });

    return this.base.request(
      'publishing content',
      async (http) => {
        const response = await http.post('/posts', {
          data: {
            attributes: {
              contentId: params.contentId,
              customMessage: params.customMessage,
              platforms: params.platforms,
              scheduleAt: params.scheduleAt,
              visibility: params.visibility,
            },
            type: 'posts',
          },
        });

        const posts = response.data?.data;
        if (Array.isArray(posts)) {
          return posts.map((post: PostResource, index: number) => ({
            contentId: params.contentId,
            createdAt: post.attributes?.createdAt || new Date().toISOString(),
            id: post.id,
            executionState:
              toTargetExecutionState(
                post.attributes?.targetExecutionState ??
                  post.attributes?.executionState,
              ) ?? TargetExecutionState.PUBLISHING,
            platform:
              toPlatform(post.attributes?.platform) ??
              params.platforms[index] ??
              params.platforms[0],
            publishedAt: post.attributes?.publishedAt,
            publishedUrl: post.attributes?.publishedUrl,
            scheduledAt: post.attributes?.scheduledAt,
            status: toPostStatus(post.attributes?.status) ?? PostStatus.PENDING,
            visibility:
              toPostVisibility(post.attributes?.visibility) ??
              PostVisibility.PUBLIC,
          }));
        }

        return [
          {
            contentId: params.contentId,
            createdAt: posts?.attributes?.createdAt || new Date().toISOString(),
            id: posts?.id,
            executionState:
              toTargetExecutionState(
                posts?.attributes?.targetExecutionState ??
                  posts?.attributes?.executionState,
              ) ?? TargetExecutionState.PUBLISHING,
            platform:
              toPlatform(posts?.attributes?.platform) ?? params.platforms[0],
            publishedAt: posts?.attributes?.publishedAt,
            publishedUrl: posts?.attributes?.publishedUrl,
            scheduledAt: posts?.attributes?.scheduledAt,
            status:
              toPostStatus(posts?.attributes?.status) ?? PostStatus.PENDING,
            visibility:
              toPostVisibility(posts?.attributes?.visibility) ??
              PostVisibility.PUBLIC,
          },
        ];
      },
      this.base.failWithDetail('Failed to publish content'),
    );
  }

  listPosts(params: PostListParams = {}): Promise<PostResponse[]> {
    this.base.logger.debug('Listing posts', { params });

    return this.base.request(
      'listing posts',
      async (http) => {
        const queryParams: Record<string, string | number> = {
          'page[limit]': params.limit || 10,
          'page[offset]': params.offset || 0,
        };

        if (params.platform && params.platform !== 'all') {
          queryParams['filter[platform]'] = params.platform;
        }

        const response = await http.get('/posts', { params: queryParams });

        return (
          response.data?.data?.map((post: PostResource) => ({
            contentId: post.attributes?.contentId,
            createdAt: post.attributes?.createdAt,
            id: post.id,
            executionState:
              toTargetExecutionState(
                post.attributes?.targetExecutionState ??
                  post.attributes?.executionState,
              ) ?? TargetExecutionState.DRAFT,
            platform: toPlatform(post.attributes?.platform),
            publishedAt: post.attributes?.publishedAt,
            publishedUrl: post.attributes?.publishedUrl,
            scheduledAt: post.attributes?.scheduledAt,
            status: toPostStatus(post.attributes?.status) ?? PostStatus.PENDING,
            visibility:
              toPostVisibility(post.attributes?.visibility) ??
              PostVisibility.PUBLIC,
          })) || []
        );
      },
      this.base.failWith('Failed to list posts'),
    );
  }

  getTrendingTopics(
    params: TrendingTopicsParams = {},
  ): Promise<TrendingTopic[]> {
    this.base.logger.debug('Getting trending topics', { params });

    return this.base.request(
      'getting trending topics',
      async (http) => {
        const response = await http.get('/trends', {
          params: {
            category: params.category || 'all',
            timeframe: params.timeframe || '24h',
          },
        });

        return (
          response.data?.data?.map((trend: TrendResource) => ({
            category: trend.attributes?.category || params.category || 'all',
            growth: trend.attributes?.growth || 0,
            relatedKeywords: trend.attributes?.relatedKeywords || [],
            topic: trend.attributes?.topic || trend.attributes?.name,
            volume: trend.attributes?.volume || 0,
          })) || []
        );
      },
      this.base.failWith('Failed to get trending topics'),
    );
  }
}
