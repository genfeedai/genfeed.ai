import { PostStatus } from '@genfeedai/enums';
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
import { toPlatform, toPostStatus } from '@mcp/tools/tool-validators';
import type { BaseApiClient } from './base-api-client';
import { CONTENT_STATUS } from './client.types';

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
              length: params.length || 'medium',
              targetAudience: params.targetAudience,
              tone: params.tone || 'professional',
              topic: params.topic,
            },
            type: 'articles',
          },
        });

        const article = response.data?.data;
        return {
          content: article?.attributes?.content || '',
          createdAt: article?.attributes?.createdAt || new Date().toISOString(),
          id: article?.id || article?.attributes?.id,
          status: article?.attributes?.status || CONTENT_STATUS.PROCESSING,
          title: article?.attributes?.title || params.topic,
          wordCount: article?.attributes?.wordCount || 0,
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
              article.attributes?.excerpt ||
              article.attributes?.content?.substring(0, 200),
            id: article.id,
            title: article.attributes?.title,
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

        return {
          content: article?.attributes?.content || '',
          createdAt: article?.attributes?.createdAt,
          id: article?.id,
          status: article?.attributes?.status || CONTENT_STATUS.PUBLISHED,
          title: article?.attributes?.title,
          updatedAt: article?.attributes?.updatedAt,
          wordCount: article?.attributes?.wordCount || 0,
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
            platform:
              toPlatform(post.attributes?.platform) ??
              params.platforms[index] ??
              params.platforms[0],
            publishedAt: post.attributes?.publishedAt,
            publishedUrl: post.attributes?.publishedUrl,
            scheduledAt: post.attributes?.scheduledAt,
            status: toPostStatus(post.attributes?.status) ?? PostStatus.PENDING,
          }));
        }

        return [
          {
            contentId: params.contentId,
            createdAt: posts?.attributes?.createdAt || new Date().toISOString(),
            id: posts?.id,
            platform:
              toPlatform(posts?.attributes?.platform) ?? params.platforms[0],
            publishedAt: posts?.attributes?.publishedAt,
            publishedUrl: posts?.attributes?.publishedUrl,
            scheduledAt: posts?.attributes?.scheduledAt,
            status:
              toPostStatus(posts?.attributes?.status) ?? PostStatus.PENDING,
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
            platform: toPlatform(post.attributes?.platform),
            publishedAt: post.attributes?.publishedAt,
            publishedUrl: post.attributes?.publishedUrl,
            scheduledAt: post.attributes?.scheduledAt,
            status: toPostStatus(post.attributes?.status) ?? PostStatus.PENDING,
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
