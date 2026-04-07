import { CLIP_FACTORY_QUEUE } from '@api/queues/clip-factory/clip-factory.constants';
import { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [ClipFactoryQueueService],
  imports: [
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
  providers: [ClipFactoryQueueService],
})
export class ClipFactoryModule {}
