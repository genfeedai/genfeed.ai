import { PostAnalyticsService } from '@services/analytics/publication-analytics.service';
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

describe('PostAnalyticsService', () => {
  let service: PostAnalyticsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostAnalyticsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(PostAnalyticsService);
  });

  it('has analytics retrieval method', () => {
    expect(typeof service.getPostAnalytics).toBe('function');
  });

  it('has analytics refresh methods', () => {
    expect(typeof service.postAnalytics).toBe('function');
    expect(typeof service.postAllAnalytics).toBe('function');
  });

  it('has getInstance static method', () => {
    expect(typeof PostAnalyticsService.getInstance).toBe('function');
  });
});
