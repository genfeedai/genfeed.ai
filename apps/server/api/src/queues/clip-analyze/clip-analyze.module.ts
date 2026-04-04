import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { ConfigModule } from '@api/config/config.module';
import { CLIP_ANALYZE_QUEUE } from '@api/queues/clip-analyze/clip-analyze.constants';
import { ClipAnalyzeProcessor } from '@api/queues/clip-analyze/clip-analyze.processor';
import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [ClipAnalyzeQueueService],
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
      name: CLIP_ANALYZE_QUEUE,
    }),
  ],
  providers: [ClipAnalyzeProcessor, ClipAnalyzeQueueService],
})
export class ClipAnalyzeModule {}
