import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { AdOptimizationAuditLogsService } from '@api/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@api/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

const ADS_SERVICES = [
  AdBulkUploadJobsService,
  AdCreativeMappingsService,
  AdOptimizationAuditLogsService,
  AdOptimizationConfigsService,
  AdOptimizationRecommendationsService,
  AdPerformanceService,
  MetaAdsService,
] as const;

@Module({
  exports: [...ADS_SERVICES],
  imports: [HttpModule, LoggerModule, PrismaModule],
  providers: [
    ...ADS_SERVICES,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class AdsServicesModule {}
