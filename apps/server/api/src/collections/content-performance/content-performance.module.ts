import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { ContentPerformanceController } from '@api/collections/content-performance/controllers/content-performance.controller';
import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { UsersModule } from '@api/collections/users/users.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Module } from '@nestjs/common';
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
    ContentPerformanceService,
    AttributionService,
    OptimizationCycleService,
    PerformanceSummaryService,
    AnalyticsSyncService,
    EmailDigestService,
    BrandMemorySyncService,
  ],
  imports: [
    forwardRef(() => BrandMemoryModule),
    forwardRef(() => PostsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => PrismaModule),
    LoggerModule,
    forwardRef(() => QueuesModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => UsersModule),
  ],
  providers: [
    ContentPerformanceService,
    AttributionService,
    PerformanceSummaryService,
    OptimizationCycleService,
    AnalyticsSyncService,
    EmailDigestService,
    BrandMemorySyncService,
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
