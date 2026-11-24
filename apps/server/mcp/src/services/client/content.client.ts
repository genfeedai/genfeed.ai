import {
  ArticleStatus,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ArticleDraftInput,
  ArticlePreviewLink,
  ArticleUpdateInput,
} from '@genfeedai/contracts/interfaces/content/article-publishing.interface';
import type {
  ApiResponse,
  ArticleResource,
  PostResource,
  TrendResource,
} from '@mcp/shared/interfaces/api-response.interface';
import type {
  ArticleResponse,
  ArticleSearchParams,
  ArticleSearchResult,
} from '@mcp/shared/interfaces/article.interface';
import type {
  AssetRemovalResponse,
  PostRemovalResponse,
} from '@mcp/shared/interfaces/content-removal.interface';
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

const WHITESPACE_RUN_PATTERN = /\s+/;

/**
 * `wordCount` is not a serialized article attribute — derive it from the
 * content the API did return rather than reporting a hardcoded 0.
 */
function countWords(content: string): number {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(WHITESPACE_RUN_PATTERN).length : 0;
}

function reviewedArticleResponse(
  article: ArticleResource | undefined,
): ArticleResponse {
  if (
    !article?.id ||
    !article.attributes ||
    !Object.values(ArticleStatus).some(
      (status) => status === article.attributes?.status,
    )
  ) {
    throw new Error('Invalid article response');
  }
  const content = article.attributes.content ?? '';
  return {
    id: article.id,
    title: article.attributes.label ?? '',
    content,
    status: article.attributes.status as ArticleStatus,
    ...(article.attributes.coverImageUrl
      ? { coverImageUrl: article.attributes.coverImageUrl }
      : {}),
    wordCount: countWords(content),
    createdAt: article.attributes.createdAt ?? new Date().toISOString(),
    updatedAt: article.attributes.updatedAt,
  };
}

/** Articles, social posts/publishing, and trending topics. */
export class ContentClient {
  constructor(private readonly base: BaseApiClient) {}

  createArticleDraft(params: ArticleDraftInput): Promise<ArticleResponse> {
    return this.base.request(
      'creating reviewed article draft',
      async (http) => {
        const response = await http.post<ApiResponse<ArticleResource>>(
          '/articles',
          {
            data: {
              type: 'articles',
              attributes: {
                label: params.label,
                slug: params.slug,
                summary: params.summary,
                content: params.content,
                ...(params.coverImageUrl
                  ? { coverImageUrl: params.coverImageUrl }
                  : {}),
                ...(params.brandId ? { brandId: params.brandId } : {}),
                status: ArticleStatus.DRAFT,
              },
            },
          },
        );
        return reviewedArticleResponse(response.data.data);
      },
      this.base.failWithDetail('Failed to create article draft'),
    );
  }

  updateArticle(params: ArticleUpdateInput): Promise<ArticleResponse> {
    const { articleId, ...fields } = params;
    return this.base.request(
      'updating article',
      async (http) => {
        const response = await http.patch<ApiResponse<ArticleResource>>(
          `/articles/${encodeURIComponent(articleId)}`,
          {
            data: {
              type: 'articles',
              id: articleId,
              attributes: fields,
            },
          },
        );
        return reviewedArticleResponse(response.data.data);
      },
      this.base.failWithDetail('Failed to update article'),
    );
  }

  getArticlePreview(
    articleId: string,
    brandId?: string,
  ): Promise<ArticlePreviewLink> {
    // Preview links are bearer credentials: do not log the response URL.
    return this.base.requestWithSafeFailure(
      'getting article preview',
      async (http) => {
        const response = await http.get<ArticlePreviewLink>(
          `/articles/${encodeURIComponent(articleId)}/preview-links`,
          { params: brandId ? { brandId } : undefined },
        );
        return response.data;
      },
      (status) =>
        status === 404
          ? 'Article not found. Check the articleId and brandId.'
          : 'Failed to get article preview',
    );
  }

  /** Soft-deletes a post and, on request, the Library media only it uses. */
  deletePost(params: {
    brandId?: string;
    deleteMedia?: boolean;
    deleteOnPlatform?: boolean;
    postId: string;
  }): Promise<PostRemovalResponse> {
    return this.base.request(
      'deleting post',
      async (http) => {
        const response = await http.post<PostRemovalResponse>(
          `/posts/${encodeURIComponent(params.postId)}/deletions`,
          {
            ...(params.brandId ? { brandId: params.brandId } : {}),
            deleteOnPlatform: params.deleteOnPlatform === true,
            includeMedia: params.deleteMedia === true,
          },
        );
        return response.data;
      },
      this.base.failWithDetail('Failed to delete post'),
    );
  }

  /** Soft-deletes one Library asset, then reads it back. */
  deleteAsset(assetId: string): Promise<AssetRemovalResponse> {
    return this.base.request(
      'deleting Library asset',
      async (http) => {
        const id = encodeURIComponent(assetId);
        await http.delete(`/ingredients/${id}`);
        const readBack = await http.get<ApiResponse<unknown[]>>(
          '/ingredients/batch',
          { params: { ids: assetId } },
        );
        const stillThere = readBack.data.data ?? [];
        return { assetId, verified: stillThere.length === 0 };
      },
      this.base.failWithDetail('Failed to delete asset'),
    );
  }

  publishArticle(
    articleId: string,
    brandId?: string,
  ): Promise<ArticleResponse> {
    return this.base.request(
      'publishing reviewed article',
      async (http) => {
        const response = await http.patch<ApiResponse<ArticleResource>>(
          `/articles/${encodeURIComponent(articleId)}`,
          {
            data: {
              type: 'articles',
              id: articleId,
              attributes: {
                status: ArticleStatus.PUBLISHED,
                ...(brandId ? { brandId } : {}),
              },
            },
          },
        );
        return reviewedArticleResponse(response.data.data);
      },
      this.base.failWithDetail('Failed to publish article'),
    );
  }

  searchArticles(params: ArticleSearchParams): Promise<ArticleSearchResult[]> {
    this.base.logger.debug('Searching articles', { params });

    return this.base.request(
      'searching articles',
      async (http) => {
        // The articles API reads flat `search`, `category`, `status`, `limit`
        // and `page` keys; JSON:API `filter[...]`/`page[...]` keys are ignored.
        const limit = params.limit || 10;
        const response = await http.get('/articles', {
          params: {
            category: params.category,
            limit,
            page: Math.floor((params.offset || 0) / limit) + 1,
            search: params.query,
            status: ArticleStatus.PUBLISHED,
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

  getArticle(articleId: string, brandId?: string): Promise<ArticleResponse> {
    this.base.logger.debug(`Getting article: ${articleId}`);

    return this.base.request(
      'getting article',
      async (http) => {
        const response = await http.get(`/articles/${articleId}`, {
          params: brandId ? { brandId } : undefined,
        });
        const article = response.data?.data;
        const content = article?.attributes?.content || '';

        return {
          content,
          ...(article?.attributes?.coverImageUrl
            ? { coverImageUrl: article.attributes.coverImageUrl }
            : {}),
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
