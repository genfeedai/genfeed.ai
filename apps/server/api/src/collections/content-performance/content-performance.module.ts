import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { ContentPerformanceController } from '@api/collections/content-performance/controllers/content-performance.controller';
import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import {
  ContentPerformance,
  ContentPerformanceSchema,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { AttributionService } from '@api/collections/content-performance/services/attribution.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { OptimizationCycleService } from '@api/collections/content-performance/services/optimization-cycle.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import {
  PostAnalytics,
  PostAnalyticsSchema,
} from '@api/collections/posts/schemas/post-analytics.schema';
import { UsersModule } from '@api/collections/users/users.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { QueuesModule } from '@api/queues/core/queues.module';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

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
    MongooseModule,
  ],
  imports: [
    BrandMemoryModule,
    PostsModule,
    NotificationsModule,
    forwardRef(() => QueuesModule),
    MongooseModule.forFeature(
      [{ name: PostAnalytics.name, schema: PostAnalyticsSchema }],
      DB_CONNECTIONS.ANALYTICS,
    ),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => UsersModule),
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContentPerformance.name,
          useFactory: () => {
            const schema = ContentPerformanceSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Compound indexes
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { name: 'idx_cp_org_created' },
            );
            schema.index(
              { brand: 1, isDeleted: 1, platform: 1 },
              { name: 'idx_cp_brand_platform' },
            );
            schema.index(
              { generationId: 1, isDeleted: 1, organization: 1 },
              { name: 'idx_cp_generation' },
            );
            schema.index(
              { isDeleted: 1, measuredAt: -1, organization: 1 },
              { name: 'idx_cp_measured_at' },
            );
            schema.index(
              { cycleNumber: 1, isDeleted: 1, organization: 1 },
              { name: 'idx_cp_cycle' },
            );
            schema.index(
              { isDeleted: 1, organization: 1, performanceScore: -1 },
              { name: 'idx_cp_performance_score' },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
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
