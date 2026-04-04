import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { FilesModule } from '@files/services/files/files.module';
import { HookRemixModule } from '@files/services/hook-remix/hook-remix.module';
import { JobLifecyclePublisherService } from '@files/services/job-lifecycle-publisher.service';
import { S3Service } from '@files/services/s3/s3.service';
import { ThumbnailsModule } from '@files/services/thumbnails/thumbnails.module';
import { UploadModule } from '@files/services/upload/upload.module';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import { YtDlpModule } from '@files/services/ytdlp/ytdlp.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    FFmpegModule,
    FilesModule,
    HookRemixModule,
    JobLifecyclePublisherService,
    S3Service,
    ThumbnailsModule,
    UploadModule,
    WebSocketService,
    YtDlpModule,
  ],
  imports: [
    FFmpegModule,
    FilesModule,
    HookRemixModule,
    ThumbnailsModule,
    UploadModule,
    YtDlpModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.TASK_PROCESSING },
      { name: QUEUE_NAMES.VIDEO_PROCESSING },
      { name: QUEUE_NAMES.IMAGE_PROCESSING },
      { name: QUEUE_NAMES.FILE_PROCESSING },
    ),
  ],
  providers: [S3Service, WebSocketService, JobLifecyclePublisherService],
})
export class ServicesModule {}
