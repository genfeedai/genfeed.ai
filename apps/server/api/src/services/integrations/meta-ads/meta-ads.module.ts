import { AdBulkUploadJobsModule } from '@api/collections/ad-bulk-upload-jobs/ad-bulk-upload-jobs.module';
import { AdCreativeMappingsModule } from '@api/collections/ad-creative-mappings/ad-creative-mappings.module';
import { AdOptimizationAuditLogsModule } from '@api/collections/ad-optimization-audit-logs/ad-optimization-audit-logs.module';
import { AdOptimizationConfigsModule } from '@api/collections/ad-optimization-configs/ad-optimization-configs.module';
import { AdOptimizationRecommendationsModule } from '@api/collections/ad-optimization-recommendations/ad-optimization-recommendations.module';
import { AdPerformanceModule } from '@api/collections/ad-performance/ad-performance.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { AdBulkUploadWorkflowService } from '@api/collections/workflows/services/ad-bulk-upload-workflow.service';
import { QueuesModule } from '@api/queues/core/queues.module';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';
import { MetaAdsOptimizationController } from '@api/services/integrations/meta-ads/controllers/meta-ads-optimization.controller';
import { AdBulkUploadService } from '@api/services/integrations/meta-ads/services/ad-bulk-upload.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    MetaAdsController,
    MetaAdsBulkController,
    MetaAdsOptimizationController,
  ],
  exports: [AdBulkUploadWorkflowService, MetaAdsService],
  imports: [
    HttpModule,
    LoggerModule,
    AdBulkUploadJobsModule,
    BrandsCoreModule,
    CredentialsCoreModule,
    QueuesModule,
    AdCreativeMappingsModule,
    AdOptimizationConfigsModule,
    AdOptimizationRecommendationsModule,
    AdOptimizationAuditLogsModule,
    AdPerformanceModule,
  ],
  providers: [
    AdBulkUploadService,
    AdBulkUploadWorkflowService,
    MetaAdsService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
  ],
})
export class MetaAdsModule {}
