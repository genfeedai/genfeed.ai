import { XAdsRepositoryExportService } from '@api/services/x-ads-repository/services/x-ads-repository-export.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('XAdsRepositoryExportService readiness boundary', () => {
  const buildService = (config: Record<string, string | undefined> = {}) =>
    new XAdsRepositoryExportService(
      {
        get: vi.fn((key: string) => config[key]),
      } as unknown as ConfigService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );

  it('reports every unmet provider and policy prerequisite without exposing credentials', () => {
    const service = buildService();

    expect(service.getReadiness()).toEqual({
      available: false,
      blockers: [
        'x_ads_repository_entitlement_not_confirmed',
        'x_ads_repository_commercial_use_not_approved',
        'x_ads_repository_contract_fixtures_missing',
      ],
      documentationUrl:
        'https://business.x.com/en/help/ads-policies/product-policies/ads-transparency',
      status: 'unavailable',
    });
  });

  it('stays unavailable even when operator acknowledgements are set until reviewed fixtures implement the wire contract', () => {
    const service = buildService({
      X_ADS_REPOSITORY_COMMERCIAL_USE_APPROVED: 'true',
      X_ADS_REPOSITORY_ENTITLEMENT_CONFIRMED: 'true',
    });

    expect(service.getReadiness()).toMatchObject({
      available: false,
      blockers: ['x_ads_repository_contract_fixtures_missing'],
      status: 'unavailable',
    });
  });

  it('fails closed before attempting an export while the provider contract is unavailable', async () => {
    const service = buildService();

    await expect(service.createExportReport()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
