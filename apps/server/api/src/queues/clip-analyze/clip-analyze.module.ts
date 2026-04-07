import { CLIP_ANALYZE_QUEUE } from '@api/queues/clip-analyze/clip-analyze.constants';
import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [ClipAnalyzeQueueService],
  imports: [
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
  providers: [ClipAnalyzeQueueService],
})
export class ClipAnalyzeModule {}
