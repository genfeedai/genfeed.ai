import { BrandsModule } from '@api/collections/brands/brands.module';
import { BatchContentController } from '@api/services/batch-content/batch-content.controller';
import { BatchContentProcessor } from '@api/services/batch-content/batch-content.processor';
import { BatchContentService } from '@api/services/batch-content/batch-content.service';
import { BatchContentQueueService } from '@api/services/batch-content/batch-content-queue.service';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { SkillExecutorModule } from '@api/services/skill-executor/skill-executor.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BatchContentController],
  exports: [BatchContentService],
  imports: [
    forwardRef(() => BrandsModule),
    LoggerModule,
    NotificationsPublisherModule,
    SkillExecutorModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 1000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: 'batch-content',
    }),
  ],
  providers: [
    BatchContentService,
    BatchContentQueueService,
    BatchContentProcessor,
  ],
})
export class BatchContentModule {}
