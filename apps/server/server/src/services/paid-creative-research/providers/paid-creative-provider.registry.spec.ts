import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ApifyAdsService } from '@server/services/integrations/apify/services/modules/apify-ads.service';
import { GoogleAdsTransparencyProvider } from '@server/services/paid-creative-research/providers/google-ads-transparency.provider';
import { MetaAdLibraryProvider } from '@server/services/paid-creative-research/providers/meta-ad-library.provider';
import { PaidCreativeProviderRegistry } from '@server/services/paid-creative-research/providers/paid-creative-provider.registry';
import { TikTokCreativeCenterProvider } from '@server/services/paid-creative-research/providers/tiktok-creative-center.provider';
import { XAdsRepositoryProvider } from '@server/services/paid-creative-research/providers/x-ads-repository.provider';

function buildConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function buildLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function buildApifyAdsService(): ApifyAdsService {
  return {
    fetchMetaAdLibraryCreatives: vi.fn().mockResolvedValue([]),
    fetchTikTokCreativeCenterCreatives: vi.fn().mockResolvedValue([]),
  } as unknown as ApifyAdsService;
}

function buildRegistry(config: ConfigService): {
  apifyAdsService: ApifyAdsService;
  registry: PaidCreativeProviderRegistry;
} {
  const apifyAdsService = buildApifyAdsService();

  return {
    apifyAdsService,
    registry: new PaidCreativeProviderRegistry(
      new GoogleAdsTransparencyProvider(),
      new MetaAdLibraryProvider(apifyAdsService, config),
      new TikTokCreativeCenterProvider(apifyAdsService, config),
      new XAdsRepositoryProvider(config, buildLogger()),
    ),
  };
}

describe('PaidCreativeProviderRegistry (#3537)', () => {
  it('routes every watched platform to the archive that actually publishes it', () => {
    const { registry } = buildRegistry(buildConfig());

    expect(registry.resolve('meta').provider).toBe('meta_ads_library');
    expect(registry.resolve('tiktok').provider).toBe('tiktok_creative_center');
    expect(registry.resolve('google').provider).toBe(
      'google_ads_transparency_center',
    );
    expect(registry.resolve('x').provider).toBe('x_ads_repository');
  });

  it('resolves youtube to the Google transparency archive rather than inventing a YouTube pool', () => {
    const { registry } = buildRegistry(buildConfig());

    expect(registry.resolve('youtube')).toBe(registry.resolve('google'));
    expect(registry.resolve('youtube').provider).toBe(
      'google_ads_transparency_center',
    );
  });

  it('reports every platform as unavailable with a machine code when Apify is unconfigured', () => {
    const { registry } = buildRegistry(buildConfig());

    const readiness = registry.getReadiness();

    expect(readiness.map((entry) => entry.platform).sort()).toEqual([
      'google',
      'meta',
      'tiktok',
      'x',
      'youtube',
    ]);
    expect(readiness.every((entry) => entry.available)).toBe(false);
    expect(readiness.every((entry) => entry.blockers.length > 0)).toBe(true);
    expect(
      readiness.find((entry) => entry.platform === 'meta')?.blockers,
    ).toEqual(['paid_creative_apify_token_missing']);
  });

  it('opens only the Apify-backed archives once the token is present', () => {
    const { registry } = buildRegistry(
      buildConfig({ APIFY_API_TOKEN: 'token-1' }),
    );

    const available = registry
      .getReadiness()
      .filter((entry) => entry.available)
      .map((entry) => entry.platform)
      .sort();

    expect(available).toEqual(['meta', 'tiktok']);
  });

  it('keeps Google, YouTube, and X fail-closed even with every environment flag set', () => {
    const { registry } = buildRegistry(
      buildConfig({
        APIFY_API_TOKEN: 'token-1',
        X_ADS_REPOSITORY_COMMERCIAL_USE_APPROVED: 'true',
        X_ADS_REPOSITORY_ENTITLEMENT_CONFIRMED: 'true',
      }),
    );

    const readiness = registry.getReadiness();
    const blocked = readiness.filter((entry) => !entry.available);

    expect(blocked.map((entry) => entry.platform).sort()).toEqual([
      'google',
      'x',
      'youtube',
    ]);
    expect(readiness.find((entry) => entry.platform === 'x')?.blockers).toEqual(
      ['x_ads_repository_contract_fixtures_missing'],
    );
    expect(
      readiness.find((entry) => entry.platform === 'google')?.blockers,
    ).toEqual(['google_ads_transparency_contract_fixtures_missing']);
  });

  it('requires both X repository approval flags to be explicitly true', () => {
    const { registry } = buildRegistry(
      buildConfig({
        X_ADS_REPOSITORY_COMMERCIAL_USE_APPROVED: 'false',
        X_ADS_REPOSITORY_ENTITLEMENT_CONFIRMED: 'false',
      }),
    );

    expect(
      registry.getReadiness().find((entry) => entry.platform === 'x')?.blockers,
    ).toEqual([
      'x_ads_repository_entitlement_not_confirmed',
      'x_ads_repository_commercial_use_not_approved',
      'x_ads_repository_contract_fixtures_missing',
    ]);
  });

  it('refuses to fetch from a fail-closed archive instead of returning an empty archive', async () => {
    const { registry } = buildRegistry(
      buildConfig({ APIFY_API_TOKEN: 'token-1' }),
    );

    await expect(
      registry.resolve('google').fetchCreatives({ limit: 10, query: 'nike' }),
    ).rejects.toThrow(/unavailable/i);
    await expect(
      registry.resolve('x').fetchCreatives({ limit: 10, query: 'nike' }),
    ).rejects.toThrow(/unavailable/i);
  });

  it('passes the archive query straight through to the Apify actor', async () => {
    const { apifyAdsService, registry } = buildRegistry(
      buildConfig({ APIFY_API_TOKEN: 'token-1' }),
    );

    await registry.resolve('meta').fetchCreatives({
      countries: ['US'],
      limit: 25,
      query: 'nike',
    });

    expect(apifyAdsService.fetchMetaAdLibraryCreatives).toHaveBeenCalledWith({
      countries: ['US'],
      limit: 25,
      query: 'nike',
    });
  });
});
