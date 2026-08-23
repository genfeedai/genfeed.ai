import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { XAdWatchedAdvertisersCoreModule } from '@api/collections/x-ad-watched-advertisers/x-ad-watched-advertisers-core.module';
import { XAdsRepositoryExportService } from '@api/services/x-ads-repository/services/x-ads-repository-export.service';
import { XAdsRepositoryIngestionService } from '@api/services/x-ads-repository/services/x-ads-repository-ingestion.service';
import { createServiceModule } from '@api/shared/service-module.factory';

/**
 * DI graph for the X Ads Repository (DSA transparency) export + ingestion
 * pipeline (#3395 item 2). `createServiceModule` prepends `ConfigModule` +
 * `LoggerModule` and the `ServiceClass` (`XAdsRepositoryIngestionService`) to
 * providers/exports. `additionalImports` pulls in `AdPerformanceModule` for
 * tenant-scoped snapshot lifecycle management and
 * `XAdWatchedAdvertisersCoreModule` (persistence only, no HTTP controller)
 * for the watchlist this pipeline reads from. `XAdsRepositoryExportService`
 * is an additional provider/export since the ingestion service depends on it
 * directly and a future workflow trigger (#3395 item 3) may need it too.
 */
export const XAdsRepositoryModule = createServiceModule(
  XAdsRepositoryIngestionService,
  {
    additionalExports: [XAdsRepositoryExportService],
    additionalImports: [AdPerformanceModule, XAdWatchedAdvertisersCoreModule],
    additionalProviders: [XAdsRepositoryExportService],
  },
);
