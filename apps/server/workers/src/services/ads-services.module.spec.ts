import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
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
