import { AnalyticsService } from '@services/analytics/analytics.service';
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

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(AnalyticsService);
  });

  it('has analytics query methods', () => {
    expect(typeof service.findAll).toBe('function');
    expect(typeof service.getOverview).toBe('function');
    expect(typeof service.getTopContent).toBe('function');
    expect(typeof service.getPlatformComparison).toBe('function');
    expect(typeof service.getTimeSeries).toBe('function');
    expect(typeof service.getGrowthTrends).toBe('function');
    expect(typeof service.getEngagement).toBe('function');
    expect(typeof service.getViralHooks).toBe('function');
  });

  it('has export method', () => {
    expect(typeof service.exportData).toBe('function');
  });

  it('has admin analytics methods', () => {
    expect(typeof service.getOrganizationsLeaderboard).toBe('function');
    expect(typeof service.getBrandsLeaderboard).toBe('function');
    expect(typeof service.getOrganizationsWithStats).toBe('function');
    expect(typeof service.getBrandsWithStats).toBe('function');
  });

  it('has getInstance static method', () => {
    expect(typeof AnalyticsService.getInstance).toBe('function');
  });
});
