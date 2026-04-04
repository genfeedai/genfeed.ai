import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import type {
  Analytics,
  OrganizationAnalytics,
} from '@mcp/shared/interfaces/analytics.interface';
import type {
  ArticleResource,
  AvatarResource,
  ImageResource,
  MusicResource,
  PostResource,
  TrendResource,
  VideoResource,
  WorkflowResource,
  WorkflowTemplateResource,
} from '@mcp/shared/interfaces/api-response.interface';
import type {
  ArticleCreationParams,
  ArticleResponse,
  ArticleSearchParams,
  ArticleSearchResult,
} from '@mcp/shared/interfaces/article.interface';
import type {
  AvatarCreationParams,
  AvatarListParams,
  AvatarResponse,
} from '@mcp/shared/interfaces/avatar.interface';
import type {
  ImageCreationParams,
  ImageListParams,
  ImageResponse,
} from '@mcp/shared/interfaces/image.interface';
import type {
  MusicCreationParams,
  MusicListParams,
  MusicResponse,
} from '@mcp/shared/interfaces/music.interface';
import type {
  CreditsUsage,
  PostListParams,
  PostResponse,
  PublishContentParams,
  SocialPlatform,
  TrendingTopic,
  TrendingTopicsParams,
  UsageStats,
} from '@mcp/shared/interfaces/post.interface';
import type {
  VideoCreationParams,
  VideoResponse,
  VideoStatus,
} from '@mcp/shared/interfaces/video.interface';
import type {
  WorkflowCreateParams,
  WorkflowExecuteParams,
  WorkflowExecutionResult,
  WorkflowListParams,
  WorkflowResponse,
  WorkflowTemplate,
} from '@mcp/shared/interfaces/workflow.interface';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import type { AxiosInstance } from 'axios';

interface ApiError {
  response?: {
    data?: { errors?: Array<{ detail?: string }> };
  };
  message?: string;
}

interface BrandResponse {
  id: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

interface PersonaResponse {
  id: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

interface CreateBatchParams {
  brandId: string;
  count: number;
  platforms: string[];
  topics?: string[];
  dateRange?: { start: string; end: string };
  style?: string;
}

interface ListBatchesParams {
  batchId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ClientService {
  private client: AxiosInstance;
  private bearerToken: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.bearerToken =
      (this.configService.get('GENFEEDAI_API_KEY') as string) || '';
    const baseURL = this.configService.get('GENFEEDAI_API_URL');

    this.client = this.httpService.axiosRef.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  setBearerToken(token: string): void {
    this.bearerToken = token;
    this.client.defaults.headers.Authorization = `Bearer ${token}`;
  }

  async postAttributes<TResponse>(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<TResponse> {
    const response = await this.client.post(endpoint, payload);
    return (response.data?.data?.attributes ??
      response.data?.data) as TResponse;
  }

  private getErrorMessage(error: ApiError, defaultMessage: string): string {
    return error.response?.data?.errors?.[0]?.detail || defaultMessage;
  }

  private logError(operation: string, error: ApiError): void {
    this.logger.error(`Error ${operation}`, error.message, {
      data: error.response?.data,
    });
  }

  async createVideo(params: VideoCreationParams): Promise<VideoResponse> {
    this.logger.debug('Creating video', { params });

    try {
      const response = await this.client.post('/videos', {
        data: {
          attributes: {
            duration: params.duration,
            height: 1080,
            model: 'google/veo-2',
            prompt: params.description,
            style: params.style,
            text: params.description,
            title: params.title,
            width: 1920,
            ...(params.voiceOver?.enabled && { voiceOver: params.voiceOver }),
          },
          type: 'videos',
        },
      });

      const video = response.data?.data;
      return {
        estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        id: video?.id || video?.attributes?.id,
        status: video?.attributes?.status || 'processing',
        url: video?.attributes?.url,
      };
    } catch (error: unknown) {
      this.logError('creating video', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to create video'),
      );
    }
  }

  async getVideoStatus(videoId: string): Promise<VideoStatus> {
    this.logger.debug(`Getting video status for ID: ${videoId}`);

    try {
      const response = await this.client.get(`/videos/${videoId}`);
      const video = response.data?.data;

      return {
        message: video?.attributes?.message || '',
        progress: video?.attributes?.progress || 0,
        status: video?.attributes?.status || 'unknown',
        url: video?.attributes?.url,
      };
    } catch (error: unknown) {
      this.logError('getting video status', error as ApiError);
      throw new Error('Failed to get video status');
    }
  }

  async listVideos(
    limit: number = 10,
    offset: number = 0,
  ): Promise<VideoResponse[]> {
    this.logger.debug(`Listing videos: limit=${limit}, offset=${offset}`);

    try {
      const response = await this.client.get('/videos', {
        params: { 'page[limit]': limit, 'page[offset]': offset },
      });

      return (
        response.data?.data?.map((video: VideoResource) => ({
          createdAt: video.attributes?.createdAt,
          duration: video.attributes?.duration,
          id: video.id,
          status: video.attributes?.status || 'unknown',
          title: video.attributes?.title || 'Untitled',
          url: video.attributes?.url,
          views: video.attributes?.views || 0,
        })) || []
      );
    } catch (error: unknown) {
      this.logError('listing videos', error as ApiError);
      throw new Error('Failed to list videos');
    }
  }

  async getVideoAnalytics(
    videoId?: string,
    timeRange: string = '7d',
  ): Promise<Analytics> {
    this.logger.debug(
      `Getting video analytics: videoId=${videoId}, timeRange=${timeRange}`,
    );

    const emptyAnalytics: Analytics = {
      averageWatchTime: 0,
      comments: 0,
      engagement: 0,
      likes: 0,
      shares: 0,
      timeRange,
      videoId: videoId || 'all',
      views: 0,
    };

    try {
      const endpoint = videoId
        ? `/analytics/videos/${videoId}`
        : '/analytics/videos';
      const response = await this.client.get(endpoint, {
        params: { timeRange },
      });
      const data = response.data?.data?.attributes || {};

      return {
        ...emptyAnalytics,
        averageWatchTime: data.averageWatchTime || 0,
        comments: data.comments || 0,
        engagement: data.engagement || 0,
        likes: data.likes || 0,
        shares: data.shares || 0,
        views: data.views || 0,
      };
    } catch (error: unknown) {
      this.logError('getting video analytics', error as ApiError);
      return emptyAnalytics;
    }
  }

  async getOrganizationAnalytics(): Promise<OrganizationAnalytics> {
    this.logger.debug('Getting organization analytics');

    const emptyOrgAnalytics: OrganizationAnalytics = {
      activeUsers: 0,
      averageVideoLength: 0,
      growthRate: 0,
      topPerformingVideos: [],
      totalEngagement: 0,
      totalVideos: 0,
      totalViews: 0,
    };

    try {
      const response = await this.client.get('/analytics/organization');
      const data = response.data?.data?.attributes || {};

      return {
        ...emptyOrgAnalytics,
        activeUsers: data.activeUsers || 0,
        averageVideoLength: data.averageVideoLength || 0,
        growthRate: data.growthRate || 0,
        topPerformingVideos: data.topPerformingVideos || [],
        totalEngagement: data.totalEngagement || 0,
        totalVideos: data.totalVideos || 0,
        totalViews: data.totalViews || 0,
      };
    } catch (error: unknown) {
      this.logError('getting organization analytics', error as ApiError);
      return emptyOrgAnalytics;
    }
  }

  async createArticle(params: ArticleCreationParams): Promise<ArticleResponse> {
    this.logger.debug('Creating article', { params });

    try {
      const response = await this.client.post('/articles/generations', {
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
        status: article?.attributes?.status || 'processing',
        title: article?.attributes?.title || params.topic,
        wordCount: article?.attributes?.wordCount || 0,
      };
    } catch (error: unknown) {
      this.logError('creating article', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to create article'),
      );
    }
  }

  async searchArticles(
    params: ArticleSearchParams,
  ): Promise<ArticleSearchResult[]> {
    this.logger.debug('Searching articles', { params });

    try {
      const response = await this.client.get('/articles', {
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
    } catch (error: unknown) {
      this.logError('searching articles', error as ApiError);
      throw new Error('Failed to search articles');
    }
  }

  async getArticle(articleId: string): Promise<ArticleResponse> {
    this.logger.debug(`Getting article: ${articleId}`);

    try {
      const response = await this.client.get(`/articles/${articleId}`);
      const article = response.data?.data;

      return {
        content: article?.attributes?.content || '',
        createdAt: article?.attributes?.createdAt,
        id: article?.id,
        status: article?.attributes?.status || 'published',
        title: article?.attributes?.title,
        updatedAt: article?.attributes?.updatedAt,
        wordCount: article?.attributes?.wordCount || 0,
      };
    } catch (error: unknown) {
      this.logError('getting article', error as ApiError);
      throw new Error('Failed to get article');
    }
  }

  async createImage(params: ImageCreationParams): Promise<ImageResponse> {
    this.logger.debug('Creating image', { params });

    try {
      const response = await this.client.post('/images', {
        data: {
          attributes: {
            prompt: params.prompt,
            quality: params.quality || 'standard',
            size: params.size || 'square',
            style: params.style || 'realistic',
          },
          type: 'images',
        },
      });

      const image = response.data?.data;
      return {
        createdAt: image?.attributes?.createdAt || new Date().toISOString(),
        id: image?.id || image?.attributes?.id,
        prompt: params.prompt,
        size: params.size || 'square',
        status: image?.attributes?.status || 'processing',
        style: params.style || 'realistic',
        url: image?.attributes?.url || '',
      };
    } catch (error: unknown) {
      this.logError('creating image', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to create image'),
      );
    }
  }

  async listImages(params: ImageListParams = {}): Promise<ImageResponse[]> {
    this.logger.debug('Listing images', { params });

    try {
      const response = await this.client.get('/images', {
        params: {
          'page[limit]': params.limit || 10,
          'page[offset]': params.offset || 0,
        },
      });

      return (
        response.data?.data?.map((image: ImageResource) => ({
          createdAt: image.attributes?.createdAt,
          id: image.id,
          prompt: image.attributes?.prompt || '',
          size: image.attributes?.size || 'square',
          status: image.attributes?.status || 'completed',
          style: image.attributes?.style || 'realistic',
          url: image.attributes?.url || '',
        })) || []
      );
    } catch (error: unknown) {
      this.logError('listing images', error as ApiError);
      throw new Error('Failed to list images');
    }
  }

  async createAvatar(params: AvatarCreationParams): Promise<AvatarResponse> {
    this.logger.debug('Creating avatar', { params });

    try {
      const response = await this.client.post('/avatars/generate', {
        data: {
          attributes: {
            age: params.age || 'middle-aged',
            gender: params.gender,
            name: params.name,
            style: params.style || 'realistic',
          },
          type: 'avatars',
        },
      });

      const avatar = response.data?.data;
      return {
        age: params.age || 'middle-aged',
        createdAt: avatar?.attributes?.createdAt || new Date().toISOString(),
        gender: params.gender,
        id: avatar?.id || avatar?.attributes?.id,
        name: params.name,
        status: avatar?.attributes?.status || 'processing',
        style: params.style || 'realistic',
        thumbnailUrl: avatar?.attributes?.thumbnailUrl,
        videoUrl: avatar?.attributes?.videoUrl,
      };
    } catch (error: unknown) {
      this.logError('creating avatar', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to create avatar'),
      );
    }
  }

  async listAvatars(params: AvatarListParams = {}): Promise<AvatarResponse[]> {
    this.logger.debug('Listing avatars', { params });

    try {
      const response = await this.client.get('/avatars', {
        params: {
          'page[limit]': params.limit || 10,
          'page[offset]': params.offset || 0,
        },
      });

      return (
        response.data?.data?.map((avatar: AvatarResource) => ({
          age: avatar.attributes?.age,
          createdAt: avatar.attributes?.createdAt,
          gender: avatar.attributes?.gender,
          id: avatar.id,
          name: avatar.attributes?.name || 'Unnamed',
          status: avatar.attributes?.status || 'completed',
          style: avatar.attributes?.style,
          thumbnailUrl: avatar.attributes?.thumbnailUrl,
          videoUrl: avatar.attributes?.videoUrl,
        })) || []
      );
    } catch (error: unknown) {
      this.logError('listing avatars', error as ApiError);
      throw new Error('Failed to list avatars');
    }
  }

  async createMusic(params: MusicCreationParams): Promise<MusicResponse> {
    this.logger.debug('Creating music', { params });

    try {
      const response = await this.client.post('/musics', {
        data: {
          attributes: {
            duration: params.duration || 60,
            genre: params.genre,
            mood: params.mood,
            prompt: params.prompt,
          },
          type: 'musics',
        },
      });

      const music = response.data?.data;
      return {
        createdAt: music?.attributes?.createdAt || new Date().toISOString(),
        duration: params.duration || 60,
        genre: params.genre,
        id: music?.id || music?.attributes?.id,
        mood: params.mood,
        prompt: params.prompt,
        status: music?.attributes?.status || 'processing',
        url: music?.attributes?.url,
      };
    } catch (error: unknown) {
      this.logError('creating music', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to create music'),
      );
    }
  }

  async listMusic(params: MusicListParams = {}): Promise<MusicResponse[]> {
    this.logger.debug('Listing music', { params });

    try {
      const response = await this.client.get('/musics', {
        params: {
          'page[limit]': params.limit || 10,
          'page[offset]': params.offset || 0,
        },
      });

      return (
        response.data?.data?.map((music: MusicResource) => ({
          createdAt: music.attributes?.createdAt,
          duration: music.attributes?.duration || 0,
          genre: music.attributes?.genre,
          id: music.id,
          mood: music.attributes?.mood,
          prompt: music.attributes?.prompt || '',
          status: music.attributes?.status || 'completed',
          url: music.attributes?.url,
        })) || []
      );
    } catch (error: unknown) {
      this.logError('listing music', error as ApiError);
      throw new Error('Failed to list music');
    }
  }

  async publishContent(params: PublishContentParams): Promise<PostResponse[]> {
    this.logger.debug('Publishing content', { params });

    try {
      const response = await this.client.post('/posts', {
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
            (post.attributes?.platform as SocialPlatform) ||
            params.platforms[index] ||
            params.platforms[0],
          publishedAt: post.attributes?.publishedAt,
          publishedUrl: post.attributes?.publishedUrl,
          scheduledAt: post.attributes?.scheduledAt,
          status:
            (post.attributes?.status as PostResponse['status']) || 'pending',
        }));
      }

      return [
        {
          contentId: params.contentId,
          createdAt: posts?.attributes?.createdAt || new Date().toISOString(),
          id: posts?.id,
          platform:
            (posts?.attributes?.platform as SocialPlatform) ||
            params.platforms[0],
          publishedAt: posts?.attributes?.publishedAt,
          publishedUrl: posts?.attributes?.publishedUrl,
          scheduledAt: posts?.attributes?.scheduledAt,
          status:
            (posts?.attributes?.status as PostResponse['status']) || 'pending',
        },
      ];
    } catch (error: unknown) {
      this.logError('publishing content', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to publish content'),
      );
    }
  }

  async listPosts(params: PostListParams = {}): Promise<PostResponse[]> {
    this.logger.debug('Listing posts', { params });

    try {
      const queryParams: Record<string, string | number> = {
        'page[limit]': params.limit || 10,
        'page[offset]': params.offset || 0,
      };

      if (params.platform && params.platform !== 'all') {
        queryParams['filter[platform]'] = params.platform;
      }

      const response = await this.client.get('/posts', { params: queryParams });

      return (
        response.data?.data?.map((post: PostResource) => ({
          contentId: post.attributes?.contentId,
          createdAt: post.attributes?.createdAt,
          id: post.id,
          platform: post.attributes?.platform,
          publishedAt: post.attributes?.publishedAt,
          publishedUrl: post.attributes?.publishedUrl,
          scheduledAt: post.attributes?.scheduledAt,
          status: post.attributes?.status || 'published',
        })) || []
      );
    } catch (error: unknown) {
      this.logError('listing posts', error as ApiError);
      throw new Error('Failed to list posts');
    }
  }

  async getTrendingTopics(
    params: TrendingTopicsParams = {},
  ): Promise<TrendingTopic[]> {
    this.logger.debug('Getting trending topics', { params });

    try {
      const response = await this.client.get('/trends', {
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
    } catch (error: unknown) {
      this.logError('getting trending topics', error as ApiError);
      throw new Error('Failed to get trending topics');
    }
  }

  async getCredits(): Promise<CreditsUsage> {
    this.logger.debug('Getting credits usage');

    try {
      const response = await this.client.get('/credits/usage');
      const data = response.data?.data?.attributes || response.data?.data || {};

      return {
        available: data.available || 0,
        breakdown: {
          articles: data.breakdown?.articles || 0,
          avatars: data.breakdown?.avatars || 0,
          images: data.breakdown?.images || 0,
          music: data.breakdown?.music || 0,
          videos: data.breakdown?.videos || 0,
        },
        resetDate: data.resetDate,
        total: data.total || 0,
        used: data.used || 0,
      };
    } catch (error: unknown) {
      this.logError('getting credits', error as ApiError);
      throw new Error('Failed to get credits usage');
    }
  }

  async getUsageStats(timeRange: string = '30d'): Promise<UsageStats> {
    this.logger.debug(`Getting usage stats for timeRange: ${timeRange}`);

    try {
      const response = await this.client.get('/usage/stats', {
        params: { timeRange },
      });
      const data = response.data?.data?.attributes || response.data?.data || {};

      return {
        contentCreated: {
          articles: data.contentCreated?.articles || 0,
          avatars: data.contentCreated?.avatars || 0,
          images: data.contentCreated?.images || 0,
          music: data.contentCreated?.music || 0,
          videos: data.contentCreated?.videos || 0,
        },
        creditsUsed: data.creditsUsed || 0,
        postsPublished: data.postsPublished || 0,
        timeRange,
        totalEngagement: data.totalEngagement || 0,
      };
    } catch (error: unknown) {
      this.logError('getting usage stats', error as ApiError);
      throw new Error('Failed to get usage stats');
    }
  }

  async createWorkflow(
    params: WorkflowCreateParams,
  ): Promise<WorkflowResponse> {
    this.logger.debug('Creating workflow', { params });

    try {
      const response = await this.client.post('/workflows', {
        data: {
          attributes: {
            description: params.description,
            name: params.name,
            schedule: params.schedule,
            steps: params.steps,
            templateId: params.templateId,
          },
          type: 'workflows',
        },
      });

      const workflow = response.data?.data;
      return {
        createdAt: workflow?.attributes?.createdAt || new Date().toISOString(),
        description: workflow?.attributes?.description || params.description,
        id: workflow?.id || workflow?.attributes?.id,
        lastRunAt: workflow?.attributes?.lastRunAt,
        name: workflow?.attributes?.name || params.name,
        nextRunAt: workflow?.attributes?.nextRunAt,
        status: workflow?.attributes?.status || 'draft',
        steps: workflow?.attributes?.steps || params.steps || [],
        updatedAt: workflow?.attributes?.updatedAt,
      };
    } catch (error: unknown) {
      this.logError('creating workflow', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to create workflow'),
      );
    }
  }

  async executeWorkflow(
    params: WorkflowExecuteParams,
  ): Promise<WorkflowExecutionResult> {
    this.logger.debug('Executing workflow', { params });

    try {
      const response = await this.client.post('/workflow-executions', {
        inputValues: params.variables,
        workflow: params.workflowId,
      });

      const execution = response.data?.data;
      return {
        completedAt: execution?.attributes?.completedAt,
        error: execution?.attributes?.error,
        executionId: execution?.id || execution?.attributes?.id,
        results: execution?.attributes?.results,
        startedAt: execution?.attributes?.startedAt || new Date().toISOString(),
        status: execution?.attributes?.status || 'started',
        workflowId: params.workflowId,
      };
    } catch (error: unknown) {
      this.logError('executing workflow', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to execute workflow'),
      );
    }
  }

  async getWorkflowStatus(workflowId: string): Promise<WorkflowResponse> {
    this.logger.debug(`Getting workflow status for ID: ${workflowId}`);

    try {
      const response = await this.client.get(`/workflows/${workflowId}`);
      const workflow = response.data?.data;

      return {
        createdAt: workflow?.attributes?.createdAt,
        currentStepIndex: workflow?.attributes?.currentStepIndex,
        description: workflow?.attributes?.description,
        id: workflow?.id,
        lastRunAt: workflow?.attributes?.lastRunAt,
        name: workflow?.attributes?.name,
        nextRunAt: workflow?.attributes?.nextRunAt,
        status: workflow?.attributes?.status || 'draft',
        steps: workflow?.attributes?.steps || [],
        updatedAt: workflow?.attributes?.updatedAt,
      };
    } catch (error: unknown) {
      this.logError('getting workflow status', error as ApiError);
      throw new Error('Failed to get workflow status');
    }
  }

  async listWorkflows(
    params: WorkflowListParams = {},
  ): Promise<WorkflowResponse[]> {
    this.logger.debug('Listing workflows', { params });

    try {
      const queryParams: Record<string, string | number> = {
        'page[limit]': params.limit || 10,
        'page[offset]': params.offset || 0,
      };

      if (params.status) {
        queryParams['filter[status]'] = params.status;
      }

      const response = await this.client.get('/workflows', {
        params: queryParams,
      });

      return (
        response.data?.data?.map((workflow: WorkflowResource) => ({
          createdAt: workflow.attributes?.createdAt,
          currentStepIndex: workflow.attributes?.currentStepIndex,
          description: workflow.attributes?.description,
          id: workflow.id,
          lastRunAt: workflow.attributes?.lastRunAt,
          name: workflow.attributes?.name,
          nextRunAt: workflow.attributes?.nextRunAt,
          status: workflow.attributes?.status || 'draft',
          steps: workflow.attributes?.steps || [],
          updatedAt: workflow.attributes?.updatedAt,
        })) || []
      );
    } catch (error: unknown) {
      this.logError('listing workflows', error as ApiError);
      throw new Error('Failed to list workflows');
    }
  }

  async listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    this.logger.debug('Listing workflow templates');

    try {
      const response = await this.client.get('/workflows/templates');

      return (
        response.data?.data?.map((template: WorkflowTemplateResource) => ({
          category: template.attributes?.category || 'general',
          creditsRequired: template.attributes?.creditsRequired,
          description:
            template.attributes?.description || 'No description available',
          estimatedDuration: template.attributes?.estimatedDuration,
          id: template.id,
          name: template.attributes?.name,
          steps: template.attributes?.steps || [],
        })) || []
      );
    } catch (error: unknown) {
      this.logError('listing workflow templates', error as ApiError);
      throw new Error('Failed to list workflow templates');
    }
  }

  async listBrands(): Promise<BrandResponse[]> {
    this.logger.debug('Listing brands');

    try {
      const response = await this.client.get('/brands');
      return (
        response.data?.data?.map(
          (brand: { id?: string; attributes?: Record<string, unknown> }) => ({
            id: brand.id || String(brand.attributes?.id || ''),
            name: String(brand.attributes?.name || 'Unnamed'),
            status: brand.attributes?.status
              ? String(brand.attributes.status)
              : undefined,
            ...(brand.attributes || {}),
          }),
        ) || []
      );
    } catch (error: unknown) {
      this.logError('listing brands', error as ApiError);
      throw new Error('Failed to list brands');
    }
  }

  async listPersonas(
    params: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<PersonaResponse[]> {
    this.logger.debug('Listing personas', { params });

    try {
      const response = await this.client.get('/personas', {
        params: {
          'filter[status]': params.status,
          'page[limit]': params.limit || 10,
          'page[offset]': params.offset || 0,
        },
      });

      return (
        response.data?.data?.map(
          (persona: { id?: string; attributes?: Record<string, unknown> }) => ({
            id: persona.id || String(persona.attributes?.id || ''),
            name: String(persona.attributes?.name || 'Unnamed'),
            status: persona.attributes?.status
              ? String(persona.attributes.status)
              : undefined,
            ...(persona.attributes || {}),
          }),
        ) || []
      );
    } catch (error: unknown) {
      this.logError('listing personas', error as ApiError);
      throw new Error('Failed to list personas');
    }
  }

  async createBatch(
    params: CreateBatchParams,
  ): Promise<Record<string, unknown>> {
    this.logger.debug('Creating content batch', { params });

    try {
      const response = await this.client.post('/batches', {
        data: {
          attributes: params,
          type: 'batches',
        },
      });

      return (response.data?.data?.attributes ||
        response.data?.data ||
        {}) as Record<string, unknown>;
    } catch (error: unknown) {
      this.logError('creating batch', error as ApiError);
      throw new Error(
        this.getErrorMessage(error as ApiError, 'Failed to create batch'),
      );
    }
  }

  async listBatches(
    params: ListBatchesParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.logger.debug('Listing content batches', { params });

    try {
      const response = await this.client.get('/batches', {
        params: {
          'filter[batchId]': params.batchId,
          'filter[status]': params.status,
          'page[limit]': params.limit || 20,
          'page[offset]': params.offset || 0,
        },
      });

      if (!Array.isArray(response.data?.data)) {
        return [];
      }

      return response.data.data.map(
        (item: { id?: string; attributes?: Record<string, unknown> }) => ({
          id: item.id || String(item.attributes?.id || ''),
          ...(item.attributes || {}),
        }),
      );
    } catch (error: unknown) {
      this.logError('listing batches', error as ApiError);
      throw new Error('Failed to list batches');
    }
  }

  // ── Meta Ads Methods ──

  async listMetaAdAccounts(): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        '/v1/integrations/meta-ads/accounts',
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('listing Meta ad accounts', error as ApiError);
      throw new Error('Failed to list Meta ad accounts');
    }
  }

  async listMetaCampaigns(
    adAccountId: string,
    status?: string,
    limit?: number,
  ): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        '/v1/integrations/meta-ads/campaigns',
        { params: { adAccountId, limit, status } },
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('listing Meta campaigns', error as ApiError);
      throw new Error('Failed to list Meta campaigns');
    }
  }

  async getMetaCampaignInsights(
    campaignId: string,
    datePreset?: string,
    since?: string,
    until?: string,
  ): Promise<unknown> {
    try {
      const response = await this.client.get(
        `/v1/integrations/meta-ads/campaigns/${campaignId}/insights`,
        { params: { datePreset, since, until } },
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('getting Meta campaign insights', error as ApiError);
      throw new Error('Failed to get Meta campaign insights');
    }
  }

  async getMetaAdSetInsights(
    adSetId: string,
    datePreset?: string,
  ): Promise<unknown> {
    try {
      const response = await this.client.get(
        `/v1/integrations/meta-ads/adsets/${adSetId}/insights`,
        { params: { datePreset } },
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('getting Meta ad set insights', error as ApiError);
      throw new Error('Failed to get Meta ad set insights');
    }
  }

  async getMetaAdInsights(adId: string, datePreset?: string): Promise<unknown> {
    try {
      const response = await this.client.get(
        `/v1/integrations/meta-ads/ads/${adId}/insights`,
        { params: { datePreset } },
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('getting Meta ad insights', error as ApiError);
      throw new Error('Failed to get Meta ad insights');
    }
  }

  async listMetaAdCreatives(
    adAccountId: string,
    limit?: number,
  ): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        '/v1/integrations/meta-ads/creatives',
        { params: { adAccountId, limit } },
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('listing Meta ad creatives', error as ApiError);
      throw new Error('Failed to list Meta ad creatives');
    }
  }

  async compareMetaCampaigns(
    campaignIds: string[],
    datePreset?: string,
  ): Promise<unknown> {
    try {
      const response = await this.client.get(
        '/v1/integrations/meta-ads/campaigns/compare',
        { params: { campaignIds: campaignIds.join(','), datePreset } },
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('comparing Meta campaigns', error as ApiError);
      throw new Error('Failed to compare Meta campaigns');
    }
  }

  async getMetaTopPerformers(
    adAccountId: string,
    metric: string,
    limit?: number,
  ): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        '/v1/integrations/meta-ads/top-performers',
        { params: { adAccountId, limit, metric } },
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('getting Meta top performers', error as ApiError);
      throw new Error('Failed to get Meta top performers');
    }
  }

  // ── Google Ads Methods ──

  async listGoogleAdsCustomers(): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        '/v1/integrations/google-ads/customers',
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('listing Google Ads customers', error as ApiError);
      throw new Error('Failed to list Google Ads customers');
    }
  }

  async listGoogleAdsCampaigns(
    customerId: string,
    status?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        '/v1/integrations/google-ads/campaigns',
        { params: { customerId, limit, loginCustomerId, status } },
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('listing Google Ads campaigns', error as ApiError);
      throw new Error('Failed to list Google Ads campaigns');
    }
  }

  async getGoogleAdsCampaignMetrics(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    segmentByDate?: boolean,
    loginCustomerId?: string,
  ): Promise<unknown> {
    try {
      const response = await this.client.get(
        `/v1/integrations/google-ads/campaigns/${campaignId}/metrics`,
        {
          params: {
            customerId,
            endDate,
            loginCustomerId,
            segmentByDate,
            startDate,
          },
        },
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('getting Google Ads campaign metrics', error as ApiError);
      throw new Error('Failed to get Google Ads campaign metrics');
    }
  }

  async getGoogleAdsAdGroupInsights(
    customerId: string,
    adGroupId: string,
    startDate?: string,
    endDate?: string,
    loginCustomerId?: string,
  ): Promise<unknown> {
    try {
      const response = await this.client.get(
        `/v1/integrations/google-ads/ad-groups/${adGroupId}/insights`,
        {
          params: { customerId, endDate, loginCustomerId, startDate },
        },
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('getting Google Ads ad group insights', error as ApiError);
      throw new Error('Failed to get Google Ads ad group insights');
    }
  }

  async getGoogleAdsKeywordPerformance(
    customerId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        '/v1/integrations/google-ads/keywords',
        {
          params: { customerId, endDate, limit, loginCustomerId, startDate },
        },
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError(
        'getting Google Ads keyword performance',
        error as ApiError,
      );
      throw new Error('Failed to get Google Ads keyword performance');
    }
  }

  async getGoogleAdsSearchTerms(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    try {
      const response = await this.client.get(
        `/v1/integrations/google-ads/search-terms/${campaignId}`,
        {
          params: { customerId, endDate, limit, loginCustomerId, startDate },
        },
      );
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('getting Google Ads search terms', error as ApiError);
      throw new Error('Failed to get Google Ads search terms');
    }
  }

  // ── Account Management Methods (CLI Parity) ──

  async getAccountInfo(): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get('/accounts');
      const account = response.data?.data?.[0] || response.data?.data;
      return {
        id: account?.id,
        ...(account?.attributes || account || {}),
      };
    } catch (error: unknown) {
      this.logError('getting account info', error as ApiError);
      throw new Error('Failed to get account info');
    }
  }

  async getJobStatus(jobId: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get(`/ingredients/${jobId}`);
      const data = response.data?.data;
      return {
        id: data?.id,
        ...(data?.attributes || data || {}),
      };
    } catch (error: unknown) {
      this.logError('getting job status', error as ApiError);
      throw new Error('Failed to get job status');
    }
  }

  // ── Admin / Infrastructure Methods (CLI Parity) ──

  async getDarkroomHealth(): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get('/darkroom/health');
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('getting darkroom health', error as ApiError);
      throw new Error('Failed to get darkroom health');
    }
  }

  async controlComfyUi(
    action: string,
    confirm?: boolean,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post('/darkroom/comfyui/control', {
        action,
        confirm,
      });
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('controlling ComfyUI', error as ApiError);
      throw new Error('Failed to control ComfyUI');
    }
  }

  async listLoras(): Promise<unknown[]> {
    try {
      const response = await this.client.get('/darkroom/loras');
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('listing LoRAs', error as ApiError);
      throw new Error('Failed to list LoRAs');
    }
  }

  async listGpuPersonas(): Promise<unknown[]> {
    try {
      const response = await this.client.get('/darkroom/personas');
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('listing GPU personas', error as ApiError);
      throw new Error('Failed to list GPU personas');
    }
  }

  // ── Training Pipeline Methods (CLI Parity) ──

  async startTraining(params: {
    handle: string;
    steps?: number;
    rank?: number;
    learningRate?: number;
  }): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post('/training/start', params);
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('starting training', error as ApiError);
      throw new Error('Failed to start training');
    }
  }

  async getTrainingStatus(jobId: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get(`/training/status/${jobId}`);
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('getting training status', error as ApiError);
      throw new Error('Failed to get training status');
    }
  }

  async getDatasetInfo(handle: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get(`/datasets/${handle}`);
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('getting dataset info', error as ApiError);
      throw new Error('Failed to get dataset info');
    }
  }

  async deleteDataset(
    handle: string,
    confirm: boolean,
  ): Promise<Record<string, unknown>> {
    if (!confirm) {
      return {
        message: `This will permanently delete dataset "${handle}". Pass confirm: true to proceed.`,
        preview: true,
      };
    }
    try {
      const response = await this.client.delete(`/datasets/${handle}`);
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('deleting dataset', error as ApiError);
      throw new Error('Failed to delete dataset');
    }
  }

  async runCaptioning(handle: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post(`/datasets/${handle}/caption`);
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('running captioning', error as ApiError);
      throw new Error('Failed to run captioning');
    }
  }

  // ── Darkroom Generation Methods (CLI Parity) ──

  async generateDarkroomContent(params: {
    type: string;
    prompt?: string;
    count?: number;
    personaHandle?: string;
  }): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post('/darkroom/generate', params);
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('generating darkroom content', error as ApiError);
      throw new Error('Failed to generate darkroom content');
    }
  }

  async getDarkroomJobStatus(jobId: string): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get(
        `/darkroom/generate/status/${jobId}`,
      );
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('getting darkroom job status', error as ApiError);
      throw new Error('Failed to get darkroom job status');
    }
  }

  // ── Agent Chat Methods (CLI Parity) ──

  async createChat(): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post('/threads');
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('creating chat', error as ApiError);
      throw new Error('Failed to create chat');
    }
  }

  async sendChatMessage(
    threadId: string,
    message: string,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post(`/threads/${threadId}/messages`, {
        content: message,
      });
      return response.data?.data || response.data || {};
    } catch (error: unknown) {
      this.logError('sending chat message', error as ApiError);
      throw new Error('Failed to send chat message');
    }
  }

  // ── Ad Insights Methods (Content Loop) ──

  async getAdPerformanceInsights(params?: {
    industry?: string;
    platform?: string;
  }): Promise<unknown> {
    try {
      const response = await this.client.get('/v1/ad-insights/benchmarks', {
        params,
      });
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('getting ad performance insights', error as ApiError);
      throw new Error('Failed to get ad performance insights');
    }
  }

  async getTopHeadlines(params?: {
    industry?: string;
    platform?: string;
  }): Promise<unknown[]> {
    try {
      const response = await this.client.get('/v1/ad-insights/top-headlines', {
        params,
      });
      return response.data?.data || response.data || [];
    } catch (error: unknown) {
      this.logError('getting top headlines', error as ApiError);
      throw new Error('Failed to get top headlines');
    }
  }

  async suggestAdHeadlines(params: {
    industry?: string;
    platform?: string;
    product?: string;
  }): Promise<unknown> {
    try {
      const response = await this.client.post(
        '/v1/ad-insights/suggest-headlines',
        params,
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('suggesting ad headlines', error as ApiError);
      throw new Error('Failed to suggest ad headlines');
    }
  }

  async generateAdVariations(params: {
    headline?: string;
    body?: string;
    platform?: string;
    count?: number;
  }): Promise<unknown> {
    try {
      const response = await this.client.post(
        '/v1/ad-insights/generate-variations',
        params,
      );
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('generating ad variations', error as ApiError);
      throw new Error('Failed to generate ad variations');
    }
  }

  async benchmarkAdPerformance(params?: {
    industry?: string;
    platform?: string;
  }): Promise<unknown> {
    try {
      const response = await this.client.get('/v1/ad-insights/benchmarks', {
        params,
      });
      return response.data?.data || response.data;
    } catch (error: unknown) {
      this.logError('benchmarking ad performance', error as ApiError);
      throw new Error('Failed to benchmark ad performance');
    }
  }
}
