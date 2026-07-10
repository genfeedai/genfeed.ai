import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AdBulkUploadJobsService } from '@server/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdCreativeMappingsService } from '@server/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { AdOptimizationAuditLogsService } from '@server/collections/ad-optimization-audit-logs/services/ad-optimization-audit-logs.service';
import { AdOptimizationConfigsService } from '@server/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { AdOptimizationRecommendationsService } from '@server/collections/ad-optimization-recommendations/services/ad-optimization-recommendations.service';
import { AdPerformanceService } from '@server/collections/ad-performance/services/ad-performance.service';
import { SERVER_TOKENS } from '@server/server.dependencies';
import { MetaAdsService } from '@server/services/integrations/meta-ads/services/meta-ads.service';

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
