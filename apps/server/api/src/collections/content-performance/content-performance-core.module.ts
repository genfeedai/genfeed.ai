import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { SERVER_TOKENS } from '@api/server.dependencies';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

/**
 * Performance persistence plus the analytics-sync leaf.
 *
 * `AnalyticsSyncService` lives here rather than on `ContentPerformanceModule`
 * so `AnalyticsCollectionModule` can consume it one-way: the workflow service
 * it owns is what `ContentPerformanceModule`'s own controller needs back.
 * Sync HTTP, digests, and optimisation stay on `ContentPerformanceModule`.
 */
@Module({
  exports: [
    AnalyticsSyncService,
    BrandMemorySyncService,
    ContentPerformanceService,
    SERVER_TOKENS.brandMemorySync,
  ],
  imports: [BrandMemoryModule, LoggerModule, PrismaModule],
  providers: [
    AnalyticsSyncService,
    BrandMemorySyncService,
    ContentPerformanceService,
    {
      provide: SERVER_TOKENS.brandMemorySync,
      useExisting: BrandMemorySyncService,
    },
    {
      provide: SERVER_TOKENS.logger,
      useExisting: LoggerService,
    },
    {
      provide: SERVER_TOKENS.prisma,
      useExisting: PrismaService,
    },
  ],
})
export class ContentPerformanceCoreModule {}
