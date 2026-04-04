import { AdBulkUploadJobsModule } from '@api/collections/ad-bulk-upload-jobs/ad-bulk-upload-jobs.module';
import { AdCreativeMappingsModule } from '@api/collections/ad-creative-mappings/ad-creative-mappings.module';
import { AdOptimizationAuditLogsModule } from '@api/collections/ad-optimization-audit-logs/ad-optimization-audit-logs.module';
import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { AdOptimizationRecommendationsModule } from '@api/collections/ad-optimization-recommendations/ad-optimization-recommendations.module';
import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';
import { MetaAdsOptimizationController } from '@api/services/integrations/meta-ads/controllers/meta-ads-optimization.controller';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { createServiceModule } from '@api/shared/service-module.factory';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(MetaAdsService, {
  additionalImports: [HttpModule],
});

@Module({
  controllers: [
    MetaAdsController,
    MetaAdsBulkController,
    MetaAdsOptimizationController,
  ],
  exports: BaseModule.exports,
  imports: [
    ...BaseModule.imports,
    forwardRef(() => AdBulkUploadJobsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => AdCreativeMappingsModule),
    forwardRef(() => AdOptimizationConfigsModule),
    forwardRef(() => AdOptimizationRecommendationsModule),
    forwardRef(() => AdOptimizationAuditLogsModule),
    forwardRef(() => AdPerformanceModule),
  ],
  providers: [...BaseModule.providers, AdBulkUploadService],
})
export class MetaAdsModule {}
