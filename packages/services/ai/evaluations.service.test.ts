import { Evaluation } from '@genfeedai/client/models';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { EvaluationType, IngredientCategory } from '@genfeedai/enums';
import type { EvaluationSerializer } from '@genfeedai/serializers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock client serializers to prevent serializer build errors
vi.mock('@genfeedai/serializers', () => ({
  EvaluationSerializer: {},
}));

// Mock the base service
vi.mock('@services/core/base.service', () => {
  const mockInstance = {
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

    protected mapOne(data: any): Evaluation {
      return new Evaluation(data.data);
    }

    protected mapMany(data: any): Evaluation[] {
      return data.data.map((item: any) => new Evaluation(item));
    }

    static getInstance(this: any, token: string) {
      // Always create a fresh instance using the CALLING class (EvaluationsService),
      // not MockBaseService — so the result has all EvaluationsService methods.
      // Avoids cross-test cache contamination (no singleton cache in tests).
      return new MockBaseService(token);
    }
  }

  return {
    BaseService: MockBaseService,
    JsonApiResponseDocument: {},
  };
});

import { EvaluationsService } from '@services/ai/evaluations.service';

describe('EvaluationsService', () => {
  const mockToken = 'test-token';
  let service: EvaluationsService;

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
      expect((instance1 as any).token).toBe('token-1');
      expect((instance2 as any).token).toBe('token-2');
    });
  });

  describe('constructor', () => {
    it('should initialize with correct endpoint', () => {
      const newService = new EvaluationsService(mockToken);

      expect((newService as any).endpoint).toBe(API_ENDPOINTS.EVALUATIONS);
    });

    it('should initialize with provided token', () => {
      const newService = new EvaluationsService(mockToken);

      expect((newService as any).token).toBe(mockToken);
    });
  });

  describe('evaluateImage', () => {
    it('should post to /images/:id endpoint', async () => {
      const imageId = 'image-123';
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateImage(imageId);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/images/${imageId}`,
        {},
      );
    });

    it('should pass options when provided', async () => {
      const imageId = 'image-123';
      const options = { evaluationType: EvaluationType.QUALITY };
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateImage(imageId, options);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/images/${imageId}`,
        options,
      );
    });

    it('should return mapped Evaluation', async () => {
      const imageId = 'image-123';
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      const result = await service.evaluateImage(imageId);

      expect(result).toBeInstanceOf(Evaluation);
    });
  });

  describe('evaluateVideo', () => {
    it('should post to /videos/:id endpoint', async () => {
      const videoId = 'video-123';
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateVideo(videoId);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/videos/${videoId}`,
        {},
      );
    });

    it('should pass options when provided', async () => {
      const videoId = 'video-123';
      const options = { evaluationType: EvaluationType.CREATIVITY };
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateVideo(videoId, options);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/videos/${videoId}`,
        options,
      );
    });
  });

  describe('evaluateArticle', () => {
    it('should post to /articles/:id endpoint', async () => {
      const articleId = 'article-123';
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateArticle(articleId);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/articles/${articleId}`,
        {},
      );
    });

    it('should pass options when provided', async () => {
      const articleId = 'article-123';
      const options = { evaluationType: EvaluationType.RELEVANCE };
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluateArticle(articleId, options);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/articles/${articleId}`,
        options,
      );
    });
  });

  describe('evaluatePost', () => {
    it('should post to /posts/:id endpoint', async () => {
      const postId = 'post-123';
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluatePost(postId);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/posts/${postId}`,
        {},
      );
    });

    it('should pass options when provided', async () => {
      const postId = 'post-123';
      const options = { evaluationType: EvaluationType.ENGAGEMENT };
      (service as any).instance.post.mockResolvedValue({
        data: mockEvaluationData,
      });

      await service.evaluatePost(postId, options);

      expect((service as any).instance.post).toHaveBeenCalledWith(
        `/posts/${postId}`,
        options,
      );
    });
  });

  describe('getImageEvaluations', () => {
    it('should get from /images/:id endpoint', async () => {
      const imageId = 'image-123';
      (service as any).instance.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getImageEvaluations(imageId);

      expect((service as any).instance.get).toHaveBeenCalledWith(
        `/images/${imageId}`,
      );
    });

    it('should return array of Evaluations', async () => {
      const imageId = 'image-123';
      (service as any).instance.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      const result = await service.getImageEvaluations(imageId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  describe('getVideoEvaluations', () => {
    it('should get from /videos/:id endpoint', async () => {
      const videoId = 'video-123';
      (service as any).instance.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getVideoEvaluations(videoId);

      expect((service as any).instance.get).toHaveBeenCalledWith(
        `/videos/${videoId}`,
      );
    });
  });

  describe('getArticleEvaluations', () => {
    it('should get from /articles/:id endpoint', async () => {
      const articleId = 'article-123';
      (service as any).instance.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getArticleEvaluations(articleId);

      expect((service as any).instance.get).toHaveBeenCalledWith(
        `/articles/${articleId}`,
      );
    });
  });

  describe('getPostEvaluations', () => {
    it('should get from /posts/:id endpoint', async () => {
      const postId = 'post-123';
      (service as any).instance.get.mockResolvedValue({
        data: mockEvaluationsListData,
      });

      await service.getPostEvaluations(postId);

      expect((service as any).instance.get).toHaveBeenCalledWith(
        `/posts/${postId}`,
      );
    });
  });

  describe('getTrends', () => {
    it('should get from /analytics/trends endpoint', async () => {
      const mockTrendsData = { trends: [] };
      (service as any).instance.get.mockResolvedValue({ data: mockTrendsData });

      await service.getTrends();

      expect((service as any).instance.get).toHaveBeenCalledWith(
        'analytics/trends',
        {
          params: undefined,
        },
      );
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
      (service as any).instance.get.mockResolvedValue({ data: mockTrendsData });

      await service.getTrends(filters);

      expect((service as any).instance.get).toHaveBeenCalledWith(
        'analytics/trends',
        {
          params: filters,
        },
      );
    });

    it('should return trends data', async () => {
      const mockTrendsData = { trends: [{ avgScore: 85, date: '2024-01' }] };
      (service as any).instance.get.mockResolvedValue({ data: mockTrendsData });

      const result = await service.getTrends();

      expect(result).toEqual(mockTrendsData);
    });
  });

  describe('deleteEvaluation', () => {
    it('should delete from /:id endpoint', async () => {
      const evaluationId = 'eval-123';
      (service as any).instance.delete.mockResolvedValue({});

      await service.deleteEvaluation(evaluationId);

      expect((service as any).instance.delete).toHaveBeenCalledWith(
        evaluationId,
      );
    });

    it('should not return anything', async () => {
      const evaluationId = 'eval-123';
      (service as any).instance.delete.mockResolvedValue({});

      const result = await service.deleteEvaluation(evaluationId);

      expect(result).toBeUndefined();
    });
  });
});
