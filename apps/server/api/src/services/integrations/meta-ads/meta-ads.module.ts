import { AdBulkUploadJobsModule } from '@api/collections/ad-bulk-upload-jobs/ad-bulk-upload-jobs.module';
import { AdCreativeMappingsModule } from '@api/collections/ad-creative-mappings/ad-creative-mappings.module';
import { AdOptimizationAuditLogsModule } from '@api/collections/ad-optimization-audit-logs/ad-optimization-audit-logs.module';
import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { AdOptimizationRecommendationsModule } from '@api/collections/ad-optimization-recommendations/ad-optimization-recommendations.module';
import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';
import { MetaAdsOptimizationController } from '@api/services/integrations/meta-ads/controllers/meta-ads-optimization.controller';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { MetaAdsService } from '@server/services/integrations/meta-ads/services/meta-ads.service';

@Module({
  controllers: [
    MetaAdsController,
    MetaAdsBulkController,
    MetaAdsOptimizationController,
  ],
  exports: [MetaAdsService],
  imports: [
    HttpModule,
    LoggerModule,
    forwardRef(() => AdBulkUploadJobsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => AdCreativeMappingsModule),
    forwardRef(() => AdOptimizationConfigsModule),
    forwardRef(() => AdOptimizationRecommendationsModule),
    forwardRef(() => AdOptimizationAuditLogsModule),
    forwardRef(() => AdPerformanceModule),
  ],
  providers: [
    AdBulkUploadService,
    MetaAdsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
  ],
})
export class MetaAdsModule {}
