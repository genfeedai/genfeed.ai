import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { ContentPerformanceController } from '@api/collections/content-performance/controllers/content-performance.controller';
import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { UsersModule } from '@api/collections/users/users.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';

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
    BrandMemoryModule,
    PostsModule,
    NotificationsModule,
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
  ],
})
export class ContentPerformanceModule {}
