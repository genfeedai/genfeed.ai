import { fetchResponse, installMockFetch } from '@services/__mocks__/http.mock';
import { SubscriptionAttributionService } from '@services/analytics/subscription-attribution.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const trackParams = {
  amount: 29,
  email: 'user@example.com',
  plan: 'pro',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  userId: 'user_1',
};

describe('SubscriptionAttributionService', () => {
  const token = 'attribution-token';
  let fetchMock: ReturnType<typeof installMockFetch>;

  beforeEach(() => {
    SubscriptionAttributionService.clearInstance(token);
    fetchMock = installMockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('caches instances per token and clears them', () => {
    const first = SubscriptionAttributionService.getInstance(token);
    expect(SubscriptionAttributionService.getInstance(token)).toBe(first);
    SubscriptionAttributionService.clearInstance(token);
    expect(SubscriptionAttributionService.getInstance(token)).not.toBe(first);
  });

  describe('trackSubscription', () => {
    it('POSTs the attribution payload', async () => {
      const attribution = { id: 'attr_1', ...trackParams };
      fetchMock.mockResolvedValue(fetchResponse(attribution));

      const service = SubscriptionAttributionService.getInstance(token);
      const result = await service.trackSubscription(trackParams);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/analytics/subscription-attribution');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(trackParams);
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${token}`,
      );
      expect(result).toEqual(attribution);
    });

    it('throws on a non-ok response', async () => {
      fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

      const service = SubscriptionAttributionService.getInstance(token);
      await expect(service.trackSubscription(trackParams)).rejects.toThrow(
        'Failed to track subscription attribution',
      );
    });
  });

  describe('getContentSubscriptionStats', () => {
    it('GETs stats for the content id', async () => {
      const stats = {
        byPlan: {},
        contentId: 'content_1',
        contentType: 'video',
        timeline: {},
        totalRevenue: 100,
        totalSubscriptions: 4,
      };
      fetchMock.mockResolvedValue(fetchResponse(stats));

      const service = SubscriptionAttributionService.getInstance(token);
      const result = await service.getContentSubscriptionStats('content_1');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/analytics/content/content_1/subscription-stats');
      expect(init.method).toBe('GET');
      expect(result).toEqual(stats);
    });

    it('throws on failure', async () => {
      fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

      const service = SubscriptionAttributionService.getInstance(token);
      await expect(
        service.getContentSubscriptionStats('content_1'),
      ).rejects.toThrow('Failed to get subscription stats');
    });
  });

  describe('getTopContentBySubscriptions', () => {
    it('builds the query string from limit and period', async () => {
      fetchMock.mockResolvedValue(fetchResponse([]));

      const service = SubscriptionAttributionService.getInstance(token);
      const result = await service.getTopContentBySubscriptions({
        limit: 5,
        period: '30d',
      });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain(
        '/analytics/top-content-by-subscriptions?limit=5&period=30d',
      );
      expect(result).toEqual([]);
    });

    it('omits the query string without params', async () => {
      fetchMock.mockResolvedValue(fetchResponse([]));

      const service = SubscriptionAttributionService.getInstance(token);
      await service.getTopContentBySubscriptions();

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url.endsWith('/analytics/top-content-by-subscriptions')).toBe(
        true,
      );
    });

    it('throws on failure', async () => {
      fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

      const service = SubscriptionAttributionService.getInstance(token);
      await expect(service.getTopContentBySubscriptions()).rejects.toThrow(
        'Failed to get top content',
      );
    });
  });

  describe('session attribution storage', () => {
    function createSessionStorage(): {
      getItem: (key: string) => string | null;
      removeItem: (key: string) => void;
      setItem: (key: string, value: string) => void;
    } {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => {
          store.delete(key);
        },
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      };
    }

    let sessionStore: ReturnType<typeof createSessionStorage>;

    beforeEach(() => {
      sessionStore = createSessionStorage();
      vi.stubGlobal('window', {});
      vi.stubGlobal('sessionStorage', sessionStore);
    });

    it('is a no-op outside the browser', () => {
      vi.unstubAllGlobals();
      const service = SubscriptionAttributionService.getInstance(token);

      service.storeContentAttribution({
        contentId: 'content_1',
        contentType: 'video',
      });
      service.clearStoredAttribution();

      expect(service.getStoredAttribution()).toBeNull();
    });

    it('stores, reads, and clears attribution via sessionStorage', () => {
      const service = SubscriptionAttributionService.getInstance(token);

      service.storeContentAttribution({
        contentId: 'content_1',
        contentType: 'video',
        linkId: 'link_1',
        platform: 'instagram',
      });

      const stored = service.getStoredAttribution();
      expect(stored).toMatchObject({
        contentId: 'content_1',
        contentType: 'video',
        linkId: 'link_1',
        platform: 'instagram',
      });
      expect(typeof stored?.timestamp).toBe('string');

      service.clearStoredAttribution();
      expect(service.getStoredAttribution()).toBeNull();
    });

    it('returns null when nothing is stored', () => {
      const service = SubscriptionAttributionService.getInstance(token);
      expect(service.getStoredAttribution()).toBeNull();
    });

    it('returns null when the stored value is not valid JSON', () => {
      sessionStore.setItem('genfeed_subscription_attribution', '{oops');

      const service = SubscriptionAttributionService.getInstance(token);
      expect(service.getStoredAttribution()).toBeNull();
    });
  });
});
