import { ModelCategory } from '@genfeedai/contracts';
import {
  type ModelRecommendation,
  RouterService,
} from '@services/ai/router.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    };
    static getInstance = vi.fn();
    static clearInstance = vi.fn();
  }
  return { HTTPBaseService: MockHTTPBaseService };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('RouterService', () => {
  let service: RouterService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RouterService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(RouterService);
  });

  it('has model selection methods', () => {
    expect(typeof service.selectModel).toBe('function');
    expect(typeof service.selectImageModel).toBe('function');
    expect(typeof service.selectVideoModel).toBe('function');
    expect(typeof service.selectTextModel).toBe('function');
  });

  it('returns the model recommendation response data', async () => {
    const recommendation = {
      alternatives: [],
      analysis: {
        complexity: 'simple',
        detectedFeatures: [],
        estimatedLength: 4,
        hasQualityIndicators: false,
        hasSpecificStyle: false,
        hasSpeedIndicators: false,
        keywords: [],
      },
      modelDetails: {
        category: 'image',
        cost: 1,
        id: 'model-1',
        key: 'provider/model-1',
        provider: 'provider',
      },
      reason: 'Best fit',
      selectedModel: 'provider/model-1',
    } satisfies ModelRecommendation;
    const post = (
      service as unknown as {
        instance: { post: ReturnType<typeof vi.fn> };
      }
    ).instance.post;
    post.mockResolvedValue({ data: recommendation });

    await expect(
      service.selectModel({
        category: ModelCategory.IMAGE,
        prompt: 'test',
      }),
    ).resolves.toBe(recommendation);
  });
});
