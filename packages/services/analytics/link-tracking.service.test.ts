import { LinkTrackingService } from '@services/analytics/link-tracking.service';
import { logger } from '@services/core/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('sends GA events through gtag when available', () => {
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    service.sendGAEvent({
      eventName: 'link_click',
      eventParams: {
        content_id: 'content-123',
        link_id: 'link-123',
        session_id: 'session-123',
      },
    });

    expect(gtag).toHaveBeenCalledWith('event', 'link_click', {
      content_id: 'content-123',
      link_id: 'link-123',
      session_id: 'session-123',
    });
    expect(logger.info).toHaveBeenCalledWith('GA4 event sent', {
      contentId: 'content-123',
      eventName: 'link_click',
    });
  });

  it('reads the GA client ID through gtag when available', () => {
    const gtag = vi.fn(
      (
        command: string,
        _measurementId: string,
        _fieldName: string,
        callback?: (id: string) => void,
      ) => {
        if (command === 'get') {
          callback?.('client-123');
        }
      },
    );
    vi.stubGlobal('window', { gtag });

    const result = service.getGAClientId();

    expect(result).toBe('client-123');
    expect(gtag).toHaveBeenCalledWith(
      'get',
      'GA_MEASUREMENT_ID',
      'client_id',
      expect.any(Function),
    );
  });
});
