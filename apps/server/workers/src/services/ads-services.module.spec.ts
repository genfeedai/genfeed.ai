import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { AdBulkUploadJobsService } from '@server/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdCreativeMappingsService } from '@server/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { AdOptimizationAuditLogsService } from '@server/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@server/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@server/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { AdPerformanceService } from '@server/collections/ad-performance/services/ad-performance.service';
import { MetaAdsService } from '@server/services/integrations/meta-ads/services/meta-ads.service';
import { AdsServicesModule } from '@workers/services/ads-services.module';

describe('AdsServicesModule', () => {
  it('composes every extracted ads service without API domain modules', async () => {
    const module = await Test.createTestingModule({
      imports: [AdsServicesModule],
    })
      .overrideProvider(HttpService)
      .useValue({})
      .overrideProvider(LoggerService)
      .useValue({ error: vi.fn(), log: vi.fn(), warn: vi.fn() })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    for (const service of [
      AdBulkUploadJobsService,
      AdCreativeMappingsService,
      AdOptimizationAuditLogsService,
      AdOptimizationConfigsService,
      AdOptimizationRecommendationsService,
      AdPerformanceService,
      MetaAdsService,
    ]) {
      expect(module.get(service)).toBeDefined();
    }
  });
});
