import { PublicService } from '@services/external/public.service';
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

describe('PublicService', () => {
  let service: PublicService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PublicService('');
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(PublicService);
  });

  it('has public profile methods', () => {
    expect(typeof service.findPublicProfileBySlug).toBe('function');
    expect(typeof service.findPublicAccountLinks).toBe('function');
    expect(typeof service.trackAccountView).toBe('function');
  });

  it('has public content methods', () => {
    expect(typeof service.findPublicBrands).toBe('function');
    expect(typeof service.findPublicVideos).toBe('function');
    expect(typeof service.findPublicImages).toBe('function');
    expect(typeof service.findPublicMusics).toBe('function');
    expect(typeof service.findPublicPosts).toBe('function');
  });

  it('has static getInstance method', () => {
    expect(typeof PublicService.getInstance).toBe('function');
  });
});
