import { InsightsService } from '@services/analytics/insights.service';
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

vi.mock('@genfeedai/constants', () => ({ ITEMS_PER_PAGE: 20 }));

describe('InsightsService', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    InsightsService.clearInstance(mockToken);
  });

  it('is a static factory class', () => {
    expect(typeof InsightsService.getInstance).toBe('function');
    expect(typeof InsightsService.clearInstance).toBe('function');
  });

  it('returns an instance via getInstance', () => {
    const instance = InsightsService.getInstance(mockToken);
    expect(instance).toBeDefined();
  });

  it('returns the same instance for the same token (singleton)', () => {
    const inst1 = InsightsService.getInstance(mockToken);
    const inst2 = InsightsService.getInstance(mockToken);
    expect(inst1).toBe(inst2);
  });

  it('instance has insights methods', () => {
    const instance = InsightsService.getInstance(mockToken);
    expect(typeof instance.getInsights).toBe('function');
    expect(typeof instance.markAsRead).toBe('function');
    expect(typeof instance.markAsDismissed).toBe('function');
  });

  it('clearInstance removes the cached instance', () => {
    const inst1 = InsightsService.getInstance(mockToken);
    InsightsService.clearInstance(mockToken);
    const inst2 = InsightsService.getInstance(mockToken);
    expect(inst1).not.toBe(inst2);
  });
});
