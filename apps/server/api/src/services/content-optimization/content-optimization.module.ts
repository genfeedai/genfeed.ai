import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { ConfigModule } from '@api/config/config.module';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { ContentOptimizationProcessor } from '@api/services/content-optimization/content-optimization.processor';
import { ContentOptimizationService } from '@api/services/content-optimization/content-optimization.service';
import { ContentOptimizationQueueService } from '@api/services/content-optimization/content-optimization-queue.service';
import { OpenAiLlmModule } from '@api/services/integrations/openai-llm/openai-llm.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContentOptimizationController],
  exports: [ContentOptimizationService, ContentOptimizationQueueService],
  imports: [
    ConfigModule,
    LoggerModule,
    BrandMemoryModule,
    forwardRef(() => ContentPerformanceModule),
    forwardRef(() => OpenAiLlmModule),
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 10000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: 'content-optimization',
    }),
  ],
  providers: [
    ContentOptimizationService,
    ContentOptimizationProcessor,
    ContentOptimizationQueueService,
  ],
})
export class ContentOptimizationModule {}
