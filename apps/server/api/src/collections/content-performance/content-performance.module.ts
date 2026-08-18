import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContentPerformanceCoreModule } from '@api/collections/content-performance/content-performance-core.module';
import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { ContentPerformanceController } from '@api/collections/content-performance/controllers/content-performance.controller';
import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import { VariationGroupScoringService } from '@api/collections/content-performance/services/variation-group-scoring.service';
import { WinnerPromotionWorkflowService } from '@api/collections/content-performance/services/winner-promotion-workflow.service';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { UsersModule } from '@api/collections/users/users.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';
import { AnalyticsSyncService } from '@server/collections/content-performance/services/analytics-sync.service';
import { EmailDigestService } from '@server/collections/content-performance/services/email-digest.service';
import { PerformanceSummaryService } from '@server/collections/content-performance/services/performance-summary.service';
import { SERVER_TOKENS } from '@server/server.dependencies';

@Module({
  controllers: [
    ContentPerformanceController,
    PerformanceSummaryController,
    AnalyticsSyncController,
  ],
  exports: [
    ContentPerformanceCoreModule,
    AttributionService,
    OptimizationCycleService,
    PerformanceSummaryService,
    AnalyticsSyncService,
    EmailDigestService,
    BrandMemorySyncService,
    WinnerPromotionWorkflowService,
    VariationGroupScoringService,
  ],
  imports: [
    BrandMemoryModule,
    ContentPerformanceCoreModule,
    PostsCoreModule,
    NotificationsModule,
    PrismaModule,
    LoggerModule,
    QueuesModule,
    OrganizationsCoreModule,
    UsersModule,
    CacheModule,
  ],
  providers: [
    AttributionService,
    PerformanceSummaryService,
    OptimizationCycleService,
    AnalyticsSyncService,
    EmailDigestService,
    BrandMemorySyncService,
    WinnerPromotionWorkflowService,
    VariationGroupScoringService,
    {
      provide: SERVER_TOKENS.brandMemorySync,
      useExisting: BrandMemorySyncService,
    },
    {
      provide: SERVER_TOKENS.logger,
      useExisting: LoggerService,
    },
    {
      provide: SERVER_TOKENS.notifications,
      useExisting: NotificationsService,
    },
    {
      provide: SERVER_TOKENS.prisma,
      useExisting: PrismaService,
    },
  ],
})
export class ContentPerformanceModule {}
