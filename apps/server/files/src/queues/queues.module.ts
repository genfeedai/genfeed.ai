import { FileQueueService } from '@files/queues/file-queue.service';
import { ImageQueueService } from '@files/queues/image-queue.service';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { TaskQueueService } from '@files/queues/task-queue.service';
import { VideoQueueService } from '@files/queues/video-queue.service';
import { YoutubeQueueService } from '@files/queues/youtube-queue.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    FileQueueService,
    ImageQueueService,
    TaskQueueService,
    VideoQueueService,
    YoutubeQueueService,
  ],
  imports: [
    BullModule.registerQueue(
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: QUEUE_NAMES.VIDEO_PROCESSING,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            delay: 1000,
            type: 'exponential',
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: QUEUE_NAMES.IMAGE_PROCESSING,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            delay: 1500,
            type: 'exponential',
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: QUEUE_NAMES.FILE_PROCESSING,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: QUEUE_NAMES.TASK_PROCESSING,
      },
      {
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            delay: 2000,
            type: 'exponential',
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
        name: QUEUE_NAMES.YOUTUBE_PROCESSING,
      },
    ),
  ],
  providers: [
    FileQueueService,
    ImageQueueService,
    TaskQueueService,
    VideoQueueService,
    YoutubeQueueService,
  ],
})
export class QueuesModule {}
