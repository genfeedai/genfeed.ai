import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/integrations', () => ({
  IntegrationHttpClient: class IntegrationHttpClient {},
  getIntegrationProviderDefinition: () => ({
    endpoints: { apiBaseUrl: 'https://graph.facebook.com' },
  }),
}));

const { MetaAdsService } = await import('./meta-ads.service');

type MetaAdsServiceInstance = InstanceType<typeof MetaAdsService>;

type MetaAdsHttpParams = {
  toHttpServiceParams: (
    searchParams: URLSearchParams,
  ) => Record<string, string | number>;
};

function readHttpParams(
  service: MetaAdsServiceInstance,
  searchParams: URLSearchParams,
): Record<string, string | number> {
  return (service as unknown as MetaAdsHttpParams).toHttpServiceParams(
    searchParams,
  );
}

function createService(): {
  get: ReturnType<typeof vi.fn>;
  service: MetaAdsServiceInstance;
} {
  const get = vi.fn().mockReturnValue(of({ data: {}, status: 200 }));
  const httpService = {
    delete: vi.fn(),
    get,
    post: vi.fn(),
  } as unknown as HttpService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  return {
    get,
    service: new MetaAdsService(httpService, loggerService),
  };
}

describe('MetaAdsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toHttpServiceParams', () => {
    it('keeps Meta object IDs as strings even when they exceed MAX_SAFE_INTEGER', () => {
      const { service } = createService();
      const unsafeId = '9007199254740993';
      const params = readHttpParams(
        service,
        new URLSearchParams({
          account_id: unsafeId,
          adset_id: unsafeId,
          campaign_id: unsafeId,
          id: unsafeId,
        }),
      );

      expect(params.id).toBe(unsafeId);
      expect(params.account_id).toBe(unsafeId);
      expect(params.campaign_id).toBe(unsafeId);
      expect(params.adset_id).toBe(unsafeId);
    });

    it('coerces genuinely numeric fields and leaves non-numeric values as strings', () => {
      const { service } = createService();
      const params = readHttpParams(
        service,
        new URLSearchParams({
          daily_budget: '5000',
          name: 'Prospecting',
          age_min: '18',
        }),
      );

      expect(params.daily_budget).toBe(5000);
      expect(params.age_min).toBe(18);
      expect(params.name).toBe('Prospecting');
    });
  });
});
