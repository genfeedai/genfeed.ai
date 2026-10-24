import { StripeService } from '@services/billing/stripe.service';
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

describe('StripeService', () => {
  let service: StripeService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StripeService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(StripeService);
  });

  it('has checkout and portal methods', () => {
    expect(typeof service.createCheckoutSession).toBe('function');
    expect(typeof service.getPortalUrl).toBe('function');
  });

  it('has static subscription utility method', () => {
    expect(typeof StripeService.isSubscriptionActive).toBe('function');
  });

  it('has getInstance static method', () => {
    expect(typeof StripeService.getInstance).toBe('function');
  });

  describe('trial card', () => {
    function http(): {
      get: ReturnType<typeof vi.fn>;
      post: ReturnType<typeof vi.fn>;
    } {
      return (service as unknown as { instance: ReturnType<typeof http> })
        .instance;
    }

    it('reads the claim status', async () => {
      http().get.mockResolvedValue({ data: { status: 'claimable' } });
      const signal = new AbortController().signal;

      await expect(service.getTrialCardStatus(signal)).resolves.toEqual({
        status: 'claimable',
      });
      expect(http().get).toHaveBeenCalledWith('/trial-card/status', {
        signal,
      });
    });

    it('claims with the finished setup session', async () => {
      http().post.mockResolvedValue({ data: { outcome: 'granted' } });
      const signal = new AbortController().signal;

      await expect(service.claimTrialCard('cs_1', signal)).resolves.toEqual({
        outcome: 'granted',
      });
      expect(http().post).toHaveBeenCalledWith(
        '/trial-card/claim',
        { sessionId: 'cs_1' },
        { signal },
      );
    });

    it('starts card setup that returns to the given path', async () => {
      http().post.mockResolvedValue({
        data: { data: { attributes: { url: 'https://stripe.test/setup' } } },
      });

      await service.createTrialCardCheckout('/acme/~/settings/credits');

      expect(http().post).toHaveBeenCalledWith('/trial-card/checkout', {
        returnPath: '/acme/~/settings/credits',
      });
    });
  });
});
