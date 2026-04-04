import { FileProcessor } from '@files/processors/file.processor';
import { ImageProcessor } from '@files/processors/image.processor';
import { TaskProcessor } from '@files/processors/task.processor';
import { VideoProcessor } from '@files/processors/video.processor';
import { YoutubeProcessor } from '@files/processors/youtube.processor';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { ServicesModule } from '@files/services/services.module';
import { YoutubeModule } from '@files/services/youtube/youtube.module';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    HttpModule,
    ServicesModule,
    YoutubeModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.VIDEO_PROCESSING },
      { name: QUEUE_NAMES.IMAGE_PROCESSING },
      { name: QUEUE_NAMES.FILE_PROCESSING },
      { name: QUEUE_NAMES.TASK_PROCESSING },
      { name: QUEUE_NAMES.YOUTUBE_PROCESSING },
    ),
  ],
  providers: [
    FileProcessor,
    ImageProcessor,
    TaskProcessor,
    VideoProcessor,
    YoutubeProcessor,
  ],
})
export class ProcessorsModule {}
