import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { ConfigModule } from '@api/config/config.module';
import { CLIP_FACTORY_QUEUE } from '@api/queues/clip-factory/clip-factory.constants';
import { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [ClipFactoryQueueService],
  imports: [
    ConfigModule,
    LoggerModule,
    HttpModule,
    ClipProjectsCoreModule,
    WhisperModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 2,
        backoff: { delay: 30_000, type: 'exponential' },
        removeOnComplete: 50,
        removeOnFail: 25,
      },
      name: CLIP_FACTORY_QUEUE,
    }),
  ],
  // ClipFactoryProcessor moved to workers ProcessorsModule (issue #84)
  providers: [ClipFactoryQueueService],
})
export class ClipFactoryModule {}
