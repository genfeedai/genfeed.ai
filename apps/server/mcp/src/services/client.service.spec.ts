import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { ClientService } from '@mcp/services/client.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosInstance } from 'axios';
import type { Mock } from 'vitest';

describe('ClientService (MCP)', () => {
  let service: ClientService;
  let loggerService: LoggerService;

  const mockAxiosInstance: Partial<AxiosInstance> = {
    defaults: {
      headers: {
        Authorization: '',
      },
    } as any,
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  };

  const mockHttpService = {
    axiosRef: {
      create: vi.fn().mockReturnValue(mockAxiosInstance),
    },
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        GENFEEDAI_API_KEY: 'test-api-key',
        GENFEEDAI_API_URL: 'https://api.genfeed.ai',
      };
      return config[key];
    }),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with API configuration', () => {
    expect(mockHttpService.axiosRef.create).toHaveBeenCalledWith({
      baseURL: 'https://api.genfeed.ai',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  });

  describe('setBearerToken', () => {
    it('should update bearer token', () => {
      const newToken = 'new-test-token';
      service.setBearerToken(newToken);
      expect(mockAxiosInstance.defaults?.headers.Authorization).toBe(
        `Bearer ${newToken}`,
      );
    });
  });

  // ==================== VIDEO TESTS ====================

  describe('createVideo', () => {
    it('should create video with valid parameters', async () => {
      const params = {
        description: 'Test video description',
        duration: 30,
        title: 'Test Video',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'processing' },
            id: 'video-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createVideo(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/videos',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'videos' }),
        }),
      );
      expect(result.id).toBe('video-123');
      expect(result.status).toBe('processing');
    });

    it('should handle video creation error', async () => {
      const params = { description: 'Test', title: 'Test' };
      (mockAxiosInstance.post as Mock).mockRejectedValue({
        message: 'API Error',
        response: { data: { errors: [{ detail: 'Failed to create video' }] } },
      });

      await expect(service.createVideo(params)).rejects.toThrow(
        'Failed to create video',
      );
    });
  });

  describe('getVideoStatus', () => {
    it('should return video status', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              message: 'Processing',
              progress: 50,
              status: 'processing',
            },
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getVideoStatus('video-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/videos/video-123');
      expect(result.status).toBe('processing');
      expect(result.progress).toBe(50);
    });
  });

  describe('listVideos', () => {
    it('should return list of videos', async () => {
      const mockResponse = {
        data: {
          data: [
            { attributes: { status: 'completed', title: 'Video 1' }, id: 'v1' },
            {
              attributes: { status: 'processing', title: 'Video 2' },
              id: 'v2',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listVideos(10, 0);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/videos', {
        params: { 'page[limit]': 10, 'page[offset]': 0 },
      });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Video 1');
    });
  });

  // ==================== ARTICLE TESTS ====================

  describe('createArticle', () => {
    it('should create article with valid parameters', async () => {
      const params = {
        keywords: ['AI', 'content'],
        length: 'medium' as const,
        tone: 'professional' as const,
        topic: 'AI Content Creation',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: {
              content: 'Article content...',
              status: 'processing',
              title: 'AI Content Creation',
              wordCount: 500,
            },
            id: 'article-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createArticle(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/articles/generations',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'articles' }),
        }),
      );
      expect(result.id).toBe('article-123');
      expect(result.title).toBe('AI Content Creation');
    });
  });

  describe('searchArticles', () => {
    it('should search articles by query', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: { excerpt: 'Preview...', title: 'Article 1' },
              id: 'a1',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.searchArticles({ limit: 10, query: 'AI' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/articles', {
        params: expect.objectContaining({ 'filter[search]': 'AI' }),
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getArticle', () => {
    it('should return article by ID', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { content: 'Full content', title: 'Article Title' },
            id: 'article-123',
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getArticle('article-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/articles/article-123',
      );
      expect(result.title).toBe('Article Title');
    });
  });

  // ==================== IMAGE TESTS ====================

  describe('createImage', () => {
    it('should create image with valid parameters', async () => {
      const params = {
        prompt: 'A sunset over mountains',
        quality: 'hd' as const,
        size: 'landscape' as const,
        style: 'photographic' as const,
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'processing', url: '' },
            id: 'image-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createImage(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/images',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'images' }),
        }),
      );
      expect(result.id).toBe('image-123');
    });
  });

  describe('listImages', () => {
    it('should return list of images', async () => {
      const mockResponse = {
        data: {
          data: [
            { attributes: { prompt: 'Sunset', url: 'url1' }, id: 'i1' },
            { attributes: { prompt: 'Mountain', url: 'url2' }, id: 'i2' },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listImages({ limit: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].prompt).toBe('Sunset');
    });
  });

  // ==================== AVATAR TESTS ====================

  describe('createAvatar', () => {
    it('should create avatar with valid parameters', async () => {
      const params = {
        age: 'middle-aged' as const,
        gender: 'female' as const,
        name: 'Sarah',
        style: 'professional' as const,
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'processing' },
            id: 'avatar-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createAvatar(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/avatars/generate',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'avatars' }),
        }),
      );
      expect(result.id).toBe('avatar-123');
      expect(result.name).toBe('Sarah');
    });
  });

  describe('listAvatars', () => {
    it('should return list of avatars', async () => {
      const mockResponse = {
        data: {
          data: [
            { attributes: { name: 'Avatar 1' }, id: 'av1' },
            { attributes: { name: 'Avatar 2' }, id: 'av2' },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listAvatars({ limit: 10 });

      expect(result).toHaveLength(2);
    });
  });

  // ==================== MUSIC TESTS ====================

  describe('createMusic', () => {
    it('should create music with valid parameters', async () => {
      const params = {
        duration: 60,
        genre: 'cinematic' as const,
        mood: 'inspirational' as const,
        prompt: 'Epic orchestral piece',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'processing' },
            id: 'music-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createMusic(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/musics',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'musics' }),
        }),
      );
      expect(result.id).toBe('music-123');
    });
  });

  describe('listMusic', () => {
    it('should return list of music tracks', async () => {
      const mockResponse = {
        data: {
          data: [{ attributes: { duration: 60, prompt: 'Track 1' }, id: 'm1' }],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listMusic({ limit: 10 });

      expect(result).toHaveLength(1);
    });
  });

  // ==================== PUBLISHING TESTS ====================

  describe('publishContent', () => {
    it('should publish content to multiple platforms', async () => {
      const params = {
        contentId: 'content-123',
        customMessage: 'Check this out!',
        platforms: ['twitter', 'linkedin'] as any,
      };

      const mockResponse = {
        data: {
          data: [
            {
              attributes: { platform: 'twitter', status: 'pending' },
              id: 'post-1',
            },
            {
              attributes: { platform: 'linkedin', status: 'pending' },
              id: 'post-2',
            },
          ],
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.publishContent(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'posts' }),
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('listPosts', () => {
    it('should return list of posts', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: { platform: 'twitter', status: 'published' },
              id: 'p1',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listPosts({ limit: 10 });

      expect(result).toHaveLength(1);
    });

    it('should filter posts by platform', async () => {
      const mockResponse = { data: { data: [] } };
      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      await service.listPosts({ limit: 10, platform: 'twitter' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/posts', {
        params: expect.objectContaining({ 'filter[platform]': 'twitter' }),
      });
    });
  });

  // ==================== ANALYTICS TESTS ====================

  describe('getTrendingTopics', () => {
    it('should return trending topics', async () => {
      const mockResponse = {
        data: {
          data: [
            { attributes: { growth: 25, topic: 'AI', volume: 10000 } },
            { attributes: { growth: 15, topic: 'Tech', volume: 8000 } },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getTrendingTopics({
        category: 'tech',
        timeframe: '24h',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trends', {
        params: { category: 'tech', timeframe: '24h' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].topic).toBe('AI');
    });
  });

  describe('getCredits', () => {
    it('should return credits usage', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              available: 500,
              breakdown: { articles: 10, images: 20, videos: 5 },
              total: 1000,
              used: 500,
            },
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getCredits();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/credits/usage');
      expect(result.available).toBe(500);
      expect(result.breakdown.videos).toBe(5);
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              contentCreated: { articles: 5, images: 10, videos: 2 },
              creditsUsed: 100,
              postsPublished: 15,
            },
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getUsageStats('30d');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/usage/stats', {
        params: { timeRange: '30d' },
      });
      expect(result.creditsUsed).toBe(100);
    });
  });

  // ==================== WORKFLOW TESTS ====================

  describe('createWorkflow', () => {
    it('should create workflow from template', async () => {
      const params = {
        description: 'Daily content workflow',
        name: 'Daily Content',
        templateId: 'daily-image-generation',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: {
              name: 'Daily Content',
              status: 'draft',
              steps: [],
            },
            id: 'workflow-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createWorkflow(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/workflows',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'workflows' }),
        }),
      );
      expect(result.id).toBe('workflow-123');
      expect(result.status).toBe('draft');
    });
  });

  describe('executeWorkflow', () => {
    it('should execute workflow', async () => {
      const params = {
        variables: { topic: 'AI trends' },
        workflowId: 'workflow-123',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'started' },
            id: 'exec-456',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.executeWorkflow(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/workflow-executions',
        {
          inputValues: { topic: 'AI trends' },
          workflow: 'workflow-123',
        },
      );
      expect(result.executionId).toBe('exec-456');
      expect(result.status).toBe('started');
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return workflow status', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              currentStepIndex: 2,
              name: 'My Workflow',
              status: 'active',
              steps: [{}, {}, {}],
            },
            id: 'workflow-123',
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getWorkflowStatus('workflow-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/workflows/workflow-123',
      );
      expect(result.status).toBe('active');
      expect(result.currentStepIndex).toBe(2);
    });
  });

  describe('listWorkflows', () => {
    it('should return list of workflows', async () => {
      const mockResponse = {
        data: {
          data: [
            { attributes: { name: 'Workflow 1', status: 'active' }, id: 'w1' },
            { attributes: { name: 'Workflow 2', status: 'draft' }, id: 'w2' },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listWorkflows({ limit: 10 });

      expect(result).toHaveLength(2);
    });

    it('should filter workflows by status', async () => {
      const mockResponse = { data: { data: [] } };
      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      await service.listWorkflows({ limit: 10, status: 'active' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/workflows', {
        params: expect.objectContaining({ 'filter[status]': 'active' }),
      });
    });
  });

  describe('listWorkflowTemplates', () => {
    it('should return list of workflow templates', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: {
                category: 'content',
                description: 'Generate daily images',
                name: 'Daily Image Generation',
              },
              id: 'daily-image-generation',
            },
            {
              attributes: {
                category: 'social',
                description: 'Publish to social media',
                name: 'Social Media Publish',
              },
              id: 'social-media-publish',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listWorkflowTemplates();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/workflows/templates',
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('daily-image-generation');
    });
  });

  // ==================== ERROR HANDLING TESTS ====================

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      (mockAxiosInstance.get as Mock).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.listVideos()).rejects.toThrow(
        'Failed to list videos',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should extract error detail from API response', async () => {
      (mockAxiosInstance.post as Mock).mockRejectedValue({
        message: 'API Error',
        response: {
          data: { errors: [{ detail: 'Specific error message' }] },
        },
      });

      await expect(
        service.createVideo({ description: 'Test', title: 'Test' }),
      ).rejects.toThrow('Specific error message');
    });
  });
});
