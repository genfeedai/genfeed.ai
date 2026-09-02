import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { AdWatchedAdvertisersCoreModule } from '@api/collections/ad-watched-advertisers/ad-watched-advertisers-core.module';
import { ApifyModule } from '@api/services/integrations/apify/apify.module';
import { GoogleAdsTransparencyProvider } from '@api/services/paid-creative-research/providers/google-ads-transparency.provider';
import { MetaAdLibraryProvider } from '@api/services/paid-creative-research/providers/meta-ad-library.provider';
import { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import { TikTokCreativeCenterProvider } from '@api/services/paid-creative-research/providers/tiktok-creative-center.provider';
import { XAdsRepositoryProvider } from '@api/services/paid-creative-research/providers/x-ads-repository.provider';
import { PaidCreativeResearchIngestionService } from '@api/services/paid-creative-research/services/paid-creative-research-ingestion.service';
import { createServiceModule } from '@api/shared/service-module.factory';

/**
 * DI graph for competitor paid-creative research across every ad platform
 * (#3537, generalizing the X-only pipeline from #3395).
 *
 * `createServiceModule` prepends `ConfigModule` + `LoggerModule` and the
 * `ServiceClass` (`PaidCreativeResearchIngestionService`) to providers/exports.
 * `additionalImports` pulls in `AdPerformanceModule` for tenant-scoped
 * snapshot lifecycle management, `AdWatchedAdvertisersCoreModule`
 * (persistence only, no HTTP controller) for the watchlist this pipeline reads
 * from, and `ApifyModule` for the two archives that are actually reachable
 * today. The provider adapters and their registry are additional
 * providers/exports so the workflow-backed trigger can report per-platform
 * readiness without instantiating the ingestion service.
 */
export const PaidCreativeResearchModule = createServiceModule(
  PaidCreativeResearchIngestionService,
  {
    additionalExports: [PaidCreativeProviderRegistry],
    additionalImports: [
      AdPerformanceModule,
      AdWatchedAdvertisersCoreModule,
      ApifyModule,
    ],
    additionalProviders: [
      GoogleAdsTransparencyProvider,
      MetaAdLibraryProvider,
      PaidCreativeProviderRegistry,
      TikTokCreativeCenterProvider,
      XAdsRepositoryProvider,
    ],
  },
);
