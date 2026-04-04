import { LinkTrackingService } from '@services/analytics/link-tracking.service';
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

describe('LinkTrackingService', () => {
  let service: LinkTrackingService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LinkTrackingService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(LinkTrackingService);
  });

  it('has link management methods', () => {
    expect(typeof service.generateTrackingLink).toBe('function');
    expect(typeof service.getLink).toBe('function');
    expect(typeof service.getContentLinks).toBe('function');
    expect(typeof service.updateLink).toBe('function');
    expect(typeof service.deleteLink).toBe('function');
  });

  it('has analytics methods', () => {
    expect(typeof service.getLinkPerformance).toBe('function');
    expect(typeof service.getContentCTAStats).toBe('function');
  });

  it('has utility methods', () => {
    expect(typeof service.buildUTMUrl).toBe('function');
    expect(typeof service.sendGAEvent).toBe('function');
  });

  it('has getInstance static method', () => {
    expect(typeof LinkTrackingService.getInstance).toBe('function');
  });
});
