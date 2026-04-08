import { API_ENDPOINTS } from '@genfeedai/constants';
import { PostSerializer } from '@genfeedai/serializers';
import { Post } from '@models/content/post.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import { EnvironmentService } from '@services/core/environment.service';

/**
 * Service for managing posts (scheduled social media content)
 *
 * Uses typed request payloads from @genfeedai/api-types for compile-time safety.
 * The `post()` method requires `CreatePostRequest` and `patch()` requires `UpdatePostRequest`.
 *
 * @example
 * ```typescript
 * const service = PostsService.getInstance(token);
 *
 * // Create with type-safe payload
 * const post = await service.post({
 *   credential: credentialId,
 *   label: 'My Post',
 *   description: 'Content here',
 *   status: PostStatus.DRAFT,
 *   ingredients: [],
 * });
 *
 * // Update with type-safe partial payload
 * await service.patch(post.id, {
 *   status: PostStatus.SCHEDULED,
 *   scheduledDate: '2024-12-01T10:00:00Z',
 * });
 * ```
 */
export class PostsService extends BaseService<Post> {
  private buildGenerationPayload(data: {
    topic: string;
    count: number;
    credential: string;
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous';
    sourceReferenceIds?: string[];
    trendId?: string;
    sourceUrl?: string;
  }) {
    return data;
  }

  constructor(token: string) {
    super(API_ENDPOINTS.POSTS, token, Post, PostSerializer);
  }

  public static getInstance(token: string): PostsService {
    return BaseService.getDataServiceInstance(
      PostsService,
      token,
    ) as PostsService;
  }

  /**
   * Enhance post content using AI
   */
  public async enhance(
    id: string,
    prompt: string,
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
  ): Promise<Post> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/enhancements`,
      { prompt, tone },
    );
    return this.mapOne(response.data);
  }

  /**
   * Generate batch of tweets using AI (saves as DRAFT posts in DB)
   */
  public async generateTweets(data: {
    topic: string;
    count: number;
    credential: string;
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous';
    sourceReferenceIds?: string[];
    trendId?: string;
    sourceUrl?: string;
  }): Promise<Post[]> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${EnvironmentService.apiEndpoint}/posts/generations`,
      this.buildGenerationPayload(data),
    );
    return this.mapMany(response.data);
  }

  /**
   * Generate cohesive Twitter thread using AI (saves as linked DRAFT posts in DB)
   * Posts are created with parent-child relationships forming a thread
   */
  public async generateThread(data: {
    topic: string;
    count: number;
    credential: string;
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous';
    sourceReferenceIds?: string[];
    trendId?: string;
    sourceUrl?: string;
  }): Promise<Post[]> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${EnvironmentService.apiEndpoint}/posts/thread-generations`,
      this.buildGenerationPayload(data),
    );
    return this.mapMany(response.data);
  }

  /**
   * Expand an existing post into a Twitter/X thread
   */
  public async expandToThread(
    id: string,
    count: 2 | 3 | 5,
    tone?: 'professional' | 'casual' | 'viral' | 'educational' | 'humorous',
  ): Promise<Post[]> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/thread-expansions`,
      {
        count,
        tone,
      },
    );
    return this.mapMany(response.data);
  }

  /**
   * Batch schedule tweets (updates existing DRAFT posts to SCHEDULED)
   */
  public async batchScheduleTweets(data: {
    tweets: Array<{
      postId: string;
      text: string;
      scheduledDate: string;
      ingredientId?: string;
      timezone?: string;
    }>;
    credential: string;
  }): Promise<Post[]> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `${EnvironmentService.apiEndpoint}/posts/schedules/batch`,
      data,
    );
    return this.mapMany(response.data);
  }

  /**
   * Create a thread of posts
   */
  public async createThread(data: {
    posts: Array<{
      credential: string;
      description: string;
      ingredient?: string;
      label: string;
      scheduledDate?: string;
      status: string;
    }>;
  }): Promise<Post[]> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/thread',
      data,
    );
    return this.mapMany(response.data);
  }

  /**
   * Create a remix version of an existing post for A/B testing
   */
  public async createRemix(
    id: string,
    description: string,
    label?: string,
  ): Promise<Post> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/remixes`,
      {
        description,
        label,
      },
    );
    return this.mapOne(response.data);
  }

  /**
   * Generate hook variations for a given topic and platform
   */
  public async generateHooks(data: {
    topic: string;
    platform: 'twitter' | 'linkedin' | 'instagram' | 'tiktok';
    count?: number;
    tone?: string;
  }): Promise<{
    hooks: string[];
    metadata: {
      platform: string;
      topic: string;
      generatedAt: string;
      count: number;
    };
  }> {
    const response = await this.instance.post<{
      hooks: string[];
      metadata: {
        platform: string;
        topic: string;
        generatedAt: string;
        count: number;
      };
    }>('/hook-generations', data);
    return response.data;
  }

  async duplicate(id: string): Promise<Post> {
    const response = await this.instance.post<Post>(`/${id}/duplicate`);
    return response.data;
  }
}
