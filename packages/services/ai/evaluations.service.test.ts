import { Evaluation } from '@genfeedai/client/models';
import { EvaluationType, IngredientCategory } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { EvaluationSerializer } from '@genfeedai/serializers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface EvaluationPayload {
  data: ConstructorParameters<typeof Evaluation>[0];
}

interface EvaluationListPayload {
  data: Array<ConstructorParameters<typeof Evaluation>[0]>;
}

interface MockHttpClient {
  delete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

interface EvaluationsServiceDouble {
  endpoint: string;
  instance: MockHttpClient;
  token: string;
}

// Mock client serializers to prevent serializer build errors
vi.mock('@genfeedai/serializers', () => ({
  EvaluationSerializer: {},
}));

// Mock the base service
vi.mock('@services/core/base.service', () => {
  const mockInstance: MockHttpClient = {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  };

  class MockBaseService {
    public endpoint: string;
    public token: string;
    public ModelClass: typeof Evaluation;
    public Serializer: typeof EvaluationSerializer;
    public instance = mockInstance;

    constructor(
      endpoint: string,
      token: string,
      ModelClass: typeof Evaluation,
      Serializer: typeof EvaluationSerializer,
    ) {
      this.endpoint = endpoint;
      this.token = token;
      this.ModelClass = ModelClass;
      this.Serializer = Serializer;
    }

    protected mapOne(data: unknown): Evaluation {
      const payload = data as EvaluationPayload;
      return new Evaluation(payload.data);
    }

    protected mapMany(data: unknown): Evaluation[] {
      const payload = data as EvaluationListPayload;
      return payload.data.map((item) => new Evaluation(item));
    }

    static getInstance(
      this: new (
        token: string,
      ) => MockBaseService,
      token: string,
    ) {
      // Always create a fresh instance using the CALLING class (EvaluationsService),
      // not MockBaseService — so the result has all EvaluationsService methods.
      // Avoids cross-test cache contamination (no singleton cache in tests).
      return new this(token);
    }

    static getDataServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return {
    BaseService: MockBaseService,
    JsonApiResponseDocument: {},
  };
});

import { EvaluationsService } from '@services/ai/evaluations.service';

function asServiceDouble(value: EvaluationsService): EvaluationsServiceDouble {
  return value as unknown as EvaluationsServiceDouble;
}

describe('EvaluationsService', () => {
  const mockToken = 'test-token';
  let service: EvaluationsService;
  let http: MockHttpClient;

  const mockEvaluationData = {
    data: {
      attributes: {
        evaluationType: EvaluationType.QUALITY,
        feedback: 'Good quality content',
        score: 85,
      },
      id: 'eval-123',
      type: 'evaluation',
    },
  };

  const mockEvaluationsListData = {
    data: [
      { attributes: { score: 80 }, id: 'eval-1' },
      { attributes: { score: 90 }, id: 'eval-2' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = EvaluationsService.getInstance(mockToken);
    http = asServiceDouble(service).instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return an EvaluationsService instance', () => {
      const instance = EvaluationsService.getInstance(mockToken);
      expect(instance).toBeInstanceOf(EvaluationsService);
    });

    it('should return different instances for different tokens', () => {
      const instance1 = EvaluationsService.getInstance('token-1');
      const instance2 = EvaluationsService.getInstance('token-2');

      // Both are EvaluationsService instances but with different tokens
      expect(instance1).toBeInstanceOf(EvaluationsService);
      expect(instance2).toBeInstanceOf(EvaluationsService);
      expect(asServiceDouble(instance1).token).toBe('token-1');
      expect(asServiceDouble(instance2).token).toBe('token-2');
    });
  });

  describe('constructor', () => {
    it('should initialize with correct endpoint', () => {
      const newService = new EvaluationsService(mockToken);

      expect(asServiceDouble(newService).endpoint).toBe(
        API_ENDPOINTS.EVALUATIONS,
      );
    });

    it('should initialize with provided token', () => {
      const newService = new EvaluationsService(mockToken);

      expect(asServiceDouble(newService).token).toBe(mockToken);
    });
  });

  describe('evaluateImage', () => {
    it('should post to /images/:id endpoint', async () => {
      const imageId = 'image-123';
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateImage(imageId);

      expect(http.post).toHaveBeenCalledWith(`/images/${imageId}`, {});
    });

    it('should pass options when provided', async () => {
      const imageId = 'image-123';
      const options = { evaluationType: EvaluationType.QUALITY };
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateImage(imageId, options);

      expect(http.post).toHaveBeenCalledWith(`/images/${imageId}`, options);
    });

    it('should return mapped Evaluation', async () => {
      const imageId = 'image-123';
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      const result = await service.evaluateImage(imageId);

      expect(result).toBeInstanceOf(Evaluation);
    });
  });

  describe('evaluateVideo', () => {
    it('should post to /videos/:id endpoint', async () => {
      const videoId = 'video-123';
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateVideo(videoId);

      expect(http.post).toHaveBeenCalledWith(`/videos/${videoId}`, {});
    });

    it('should pass options when provided', async () => {
      const videoId = 'video-123';
      const options = { evaluationType: EvaluationType.CREATIVITY };
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateVideo(videoId, options);

      expect(http.post).toHaveBeenCalledWith(`/videos/${videoId}`, options);
    });
  });

  describe('evaluateArticle', () => {
    it('should post to /articles/:id endpoint', async () => {
      const articleId = 'article-123';
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateArticle(articleId);

      expect(http.post).toHaveBeenCalledWith(`/articles/${articleId}`, {});
    });

    it('should pass options when provided', async () => {
      const articleId = 'article-123';
      const options = { evaluationType: EvaluationType.RELEVANCE };
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateArticle(articleId, options);

      expect(http.post).toHaveBeenCalledWith(`/articles/${articleId}`, options);
    });
  });

  describe('evaluatePost', () => {
    it('should post to /posts/:id endpoint', async () => {
      const postId = 'post-123';
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluatePost(postId);

      expect(http.post).toHaveBeenCalledWith(`/posts/${postId}`, {});
    });

    it('should pass options when provided', async () => {
      const postId = 'post-123';
      const options = { evaluationType: EvaluationType.ENGAGEMENT };
      http.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluatePost(postId, options);

      expect(http.post).toHaveBeenCalledWith(`/posts/${postId}`, options);
    });
  });

  describe('getImageEvaluations', () => {
    it('should get from collapsed endpoint with entityType=images', async () => {
      const imageId = 'image-123';
      http.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getImageEvaluations(imageId);

      expect(http.get).toHaveBeenCalledWith('', {
        params: { entityId: imageId, entityType: 'images' },
      });
    });

    it('should return array of Evaluations', async () => {
      const imageId = 'image-123';
      http.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      const result = await service.getImageEvaluations(imageId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  describe('getVideoEvaluations', () => {
    it('should get from collapsed endpoint with entityType=videos', async () => {
      const videoId = 'video-123';
      http.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getVideoEvaluations(videoId);

      expect(http.get).toHaveBeenCalledWith('', {
        params: { entityId: videoId, entityType: 'videos' },
      });
    });
  });

  describe('getArticleEvaluations', () => {
    it('should get from collapsed endpoint with entityType=articles', async () => {
      const articleId = 'article-123';
      http.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getArticleEvaluations(articleId);

      expect(http.get).toHaveBeenCalledWith('', {
        params: { entityId: articleId, entityType: 'articles' },
      });
    });
  });

  describe('getPostEvaluations', () => {
    it('should get from collapsed endpoint with entityType=posts', async () => {
      const postId = 'post-123';
      http.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getPostEvaluations(postId);

      expect(http.get).toHaveBeenCalledWith('', {
        params: { entityId: postId, entityType: 'posts' },
      });
    });
  });

  describe('getTrends', () => {
    it('should get from /analytics/trends endpoint', async () => {
      const mockTrendsData = { trends: [] };
      http.get.mockResolvedValue({ data: mockTrendsData });

      await service.getTrends();

      expect(http.get).toHaveBeenCalledWith('analytics/trends', {
        params: undefined,
      });
    });

    it('should pass filters when provided', async () => {
      const mockTrendsData = { trends: [] };
      const filters = {
        brand: 'brand-123',
        contentType: IngredientCategory.IMAGE,
        endDate: '2024-12-31',
        evaluationType: EvaluationType.QUALITY,
        maxScore: '100',
        minScore: '50',
        startDate: '2024-01-01',
      };
      http.get.mockResolvedValue({ data: mockTrendsData });

      await service.getTrends(filters);

      expect(http.get).toHaveBeenCalledWith('analytics/trends', {
        params: filters,
      });
    });

    it('should return trends data', async () => {
      const mockTrendsData = { trends: [{ avgScore: 85, date: '2024-01' }] };
      http.get.mockResolvedValue({ data: mockTrendsData });

      const result = await service.getTrends();

      expect(result).toEqual(mockTrendsData);
    });
  });

  describe('deleteEvaluation', () => {
    it('should delete from /:id endpoint', async () => {
      const evaluationId = 'eval-123';
      http.delete.mockResolvedValue({});

      await service.deleteEvaluation(evaluationId);

      expect(http.delete).toHaveBeenCalledWith(evaluationId);
    });

    it('should not return anything', async () => {
      const evaluationId = 'eval-123';
      http.delete.mockResolvedValue({});

      const result = await service.deleteEvaluation(evaluationId);

      expect(result).toBeUndefined();
    });
  });
});
