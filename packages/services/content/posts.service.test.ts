import { API_ENDPOINTS } from '@genfeedai/constants';
import { PostSerializer } from '@genfeedai/serializers';
import { Post } from '@models/content/post.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock EnvironmentService
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai',
  },
}));

// Mock BaseService
const mockInstance = {
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
};

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public endpoint: string;
    public token: string;
    public ModelClass: typeof Post;
    public Serializer: typeof PostSerializer;
    public instance = mockInstance;

    constructor(
      endpoint: string,
      token: string,
      ModelClass: typeof Post,
      Serializer: typeof PostSerializer,
    ) {
      this.endpoint = endpoint;
      this.token = token;
      this.ModelClass = ModelClass;
      this.Serializer = Serializer;
    }

    static getInstance(token: string): MockBaseService {
      return new MockBaseService(
        API_ENDPOINTS.POSTS,
        token,
        Post,
        PostSerializer,
      );
    }

    static getDataServiceInstance(
      ServiceClass: new (token: string) => unknown,
      token: string,
    ) {
      return new ServiceClass(token);
    }

    protected async mapOne(data: any): Promise<Post> {
      return new Post(data.data || data);
    }

    protected async mapMany(data: any): Promise<Post[]> {
      const items = data.data || data;
      return Array.isArray(items)
        ? items.map((item: any) => new Post(item))
        : [];
    }
  }

  return {
    BaseService: MockBaseService,
    JsonApiResponseDocument: {},
  };
});

import { PostsService } from '@services/content/posts.service';

describe('PostsService', () => {
  const mockToken = 'test-token';
  let service: PostsService;

  const mockPostData = {
    data: {
      attributes: {
        status: 'draft',
        text: 'Test post content',
      },
      id: 'post-123',
      type: 'post',
    },
  };

  const mockPostsData = {
    data: [
      { id: 'post-1', text: 'Post 1' },
      { id: 'post-2', text: 'Post 2' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostsService(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct endpoint', () => {
      expect((service as any).endpoint).toBe(API_ENDPOINTS.POSTS);
    });

    it('should initialize with provided token', () => {
      expect((service as any).token).toBe(mockToken);
    });
  });

  describe('getInstance', () => {
    it('should return PostsService instance', () => {
      const instance = PostsService.getInstance(mockToken);

      expect(instance).toBeDefined();
    });
  });

  describe('enhance', () => {
    it('should enhance post with prompt only', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostData });

      const result = await service.enhance('post-123', 'Make it better');

      expect(mockInstance.post).toHaveBeenCalledWith('/post-123/enhancements', {
        prompt: 'Make it better',
        tone: undefined,
      });
      expect(result).toBeInstanceOf(Post);
    });

    it('should enhance post with prompt and tone', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostData });

      await service.enhance('post-123', 'Improve this', 'professional');

      expect(mockInstance.post).toHaveBeenCalledWith('/post-123/enhancements', {
        prompt: 'Improve this',
        tone: 'professional',
      });
    });

    it('should support all tone options', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostData });

      const tones = [
        'professional',
        'casual',
        'viral',
        'educational',
        'humorous',
      ] as const;

      for (const tone of tones) {
        await service.enhance('post-123', 'Test', tone);

        expect(mockInstance.post).toHaveBeenCalledWith(
          '/post-123/enhancements',
          {
            prompt: 'Test',
            tone,
          },
        );
      }
    });
  });

  describe('generateTweets', () => {
    it('should generate tweets with required params', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        count: 5,
        credential: 'cred-123',
        topic: 'AI technology',
      };

      const result = await service.generateTweets(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/generations',
        data,
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('should generate tweets with tone', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        count: 3,
        credential: 'cred-123',
        tone: 'viral' as const,
        topic: 'Tech news',
      };

      await service.generateTweets(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/generations',
        data,
      );
    });

    it('should forward remix lineage metadata when provided', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        count: 1,
        credential: 'cred-123',
        sourceReferenceIds: ['507f1f77bcf86cd799439099'],
        sourceUrl: 'https://x.com/example/status/1',
        topic: 'Tech news',
        trendId: '507f1f77bcf86cd799439098',
      };

      await service.generateTweets(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/generations',
        data,
      );
    });
  });

  describe('generateThread', () => {
    it('should generate thread with required params', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        count: 5,
        credential: 'cred-123',
        topic: 'AI developments',
      };

      const result = await service.generateThread(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/thread-generations',
        data,
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('should generate thread with tone', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        count: 7,
        credential: 'cred-123',
        tone: 'educational' as const,
        topic: 'Startup tips',
      };

      await service.generateThread(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/thread-generations',
        data,
      );
    });

    it('should forward remix lineage metadata for thread generation', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        count: 5,
        credential: 'cred-123',
        sourceReferenceIds: ['507f1f77bcf86cd799439099'],
        sourceUrl: 'https://x.com/example/status/1',
        topic: 'Startup tips',
        trendId: '507f1f77bcf86cd799439098',
      };

      await service.generateThread(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/thread-generations',
        data,
      );
    });
  });

  describe('expandToThread', () => {
    it('should expand post to thread with count 2', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const result = await service.expandToThread('post-123', 2);

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/post-123/thread-expansions',
        {
          count: 2,
          tone: undefined,
        },
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('should expand post to thread with count 3', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      await service.expandToThread('post-123', 3, 'casual');

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/post-123/thread-expansions',
        {
          count: 3,
          tone: 'casual',
        },
      );
    });

    it('should expand post to thread with count 5', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      await service.expandToThread('post-123', 5, 'humorous');

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/post-123/thread-expansions',
        {
          count: 5,
          tone: 'humorous',
        },
      );
    });
  });

  describe('batchScheduleTweets', () => {
    it('should batch schedule tweets', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        credential: 'cred-123',
        tweets: [
          {
            postId: 'post-1',
            scheduledDate: '2024-12-25T10:00:00Z',
            text: 'Tweet 1',
          },
          {
            postId: 'post-2',
            scheduledDate: '2024-12-25T14:00:00Z',
            text: 'Tweet 2',
          },
        ],
      };

      const result = await service.batchScheduleTweets(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/schedules/batch',
        data,
      );
      expect(Array.isArray(result)).toBe(true);
    });

    it('should batch schedule with optional params', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostsData });

      const data = {
        credential: 'cred-123',
        tweets: [
          {
            ingredientId: 'ingredient-123',
            postId: 'post-1',
            scheduledDate: '2024-12-25T10:00:00Z',
            text: 'Tweet with media',
            timezone: 'America/New_York',
          },
        ],
      };

      await service.batchScheduleTweets(data);

      expect(mockInstance.post).toHaveBeenCalledWith(
        'https://api.genfeed.ai/posts/schedules/batch',
        data,
      );
    });
  });

  describe('createRemix', () => {
    it('should create remix with description only', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostData });

      const result = await service.createRemix('post-123', 'Make it shorter');

      expect(mockInstance.post).toHaveBeenCalledWith('/post-123/remixes', {
        description: 'Make it shorter',
        label: undefined,
      });
      expect(result).toBeInstanceOf(Post);
    });

    it('should create remix with description and label', async () => {
      mockInstance.post.mockResolvedValue({ data: mockPostData });

      await service.createRemix('post-123', 'Add emojis', 'Emoji Version');

      expect(mockInstance.post).toHaveBeenCalledWith('/post-123/remixes', {
        description: 'Add emojis',
        label: 'Emoji Version',
      });
    });
  });
});
